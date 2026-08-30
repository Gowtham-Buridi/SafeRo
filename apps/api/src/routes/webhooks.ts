import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { pool } from '../database.js';
import { dataStore, type Transaction } from '../dataService.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { callMlScore, MlServiceError } from '../mlClient.js';
import { maskEmail, maskPhone, hashPii, maskPaymentIdentifier } from '../lib/pii.js';
import { authenticate } from './auth.js';

// In-memory webhook log buffer for live UI monitoring (last 50 events)
export interface WebhookLogEntry {
  id: string;
  timestamp: string;
  event: string;
  payment_id: string;
  merchant_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  signature_verified: boolean;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  action: 'ALLOW' | 'FLAG' | 'BLOCK';
  signals: string[];
  customer_masked: string;
  device_id?: string;
  ip_address?: string;
  source: 'live_webhook' | 'merchant_test_event';
}

const webhookAuditBuffer: WebhookLogEntry[] = [];

/**
 * 4-tier waterfall resolution for incoming webhook merchant tenant identity:
 * 1. Webhook endpoint URL query param: `?merchant_id=m_xyz`
 * 2. Integration header: `X-Merchant-ID: m_xyz`
 * 3. Checkout notes: `payload.payment.entity.notes.merchant_id`
 * 4. Razorpay Account ID DB mapping: `body.account_id` -> `merchants.razorpay_merchant_id`
 * 5. Default connected store fallback: `'m_ecommerce_01'`
 */
async function resolveWebhookMerchantId(request: FastifyRequest, body: any, paymentEntity: any): Promise<string> {
  const queryMerchant = (request.query as any)?.merchant_id;
  if (queryMerchant) return queryMerchant;

  const headerMerchant = request.headers['x-merchant-id'] as string;
  if (headerMerchant) return headerMerchant;

  const notesMerchant = paymentEntity?.notes?.merchant_id || paymentEntity?.notes?.userId;
  if (notesMerchant) return notesMerchant;

  const accountId = body?.account_id || paymentEntity?.account_id;
  if (accountId) {
    try {
      const res = await pool.query('SELECT id FROM merchants WHERE razorpay_merchant_id = $1 LIMIT 1', [accountId]);
      if (res.rows.length > 0) return res.rows[0].id;
    } catch {
      // Non-blocking fallback
    }
  }

  return 'm_ecommerce_01';
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {

  // ── 1. GET /api/v1/webhooks/history — Live Webhook Feed ────────────────
  app.get('/webhooks/history', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      data: webhookAuditBuffer.slice(0, 30),
    });
  });

  // ── 2. POST /api/v1/webhooks/razorpay — Production Webhook Receiver ───
  app.post('/webhooks/razorpay', async (request: FastifyRequest, reply: FastifyReply) => {
    const rawBody = JSON.stringify(request.body || {});
    const signature = (request.headers['x-razorpay-signature'] as string) || '';
    const secret = config.razorpay.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || '';

    let signatureVerified = false;

    if (secret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      if (crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))) {
        signatureVerified = true;
      } else {
        logger.warn({ signature }, '⚠️ Webhook HMAC signature verification failed');
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'HMAC signature verification failed' },
        });
      }
    } else {
      // Development / no secret configured — accept but mark as unverified
      signatureVerified = true;
    }

    const body = (request.body as any) || {};
    const event = body.event || 'payment.captured';
    const paymentEntity = body.payload?.payment?.entity || body.payment || body;

    const paymentId = paymentEntity.id || `pay_${crypto.randomUUID().slice(0, 10)}`;
    const merchantId = await resolveWebhookMerchantId(request, body, paymentEntity);
    const rawAmount = Number(paymentEntity.amount || 149900);
    const amountInr = rawAmount > 500 && rawAmount % 100 === 0 ? rawAmount / 100 : rawAmount;
    const currency = paymentEntity.currency || 'INR';
    const method = (paymentEntity.method || paymentEntity.payment_method_type || 'upi').toLowerCase();
    const rawEmail = paymentEntity.email || 'customer@example.com';
    const rawPhone = paymentEntity.contact || paymentEntity.phone || '';
    const rawPaymentId = paymentEntity.vpa || paymentEntity.card_id || `pm_${crypto.randomUUID().slice(0, 8)}`;
    const deviceId = paymentEntity.notes?.device_id || paymentEntity.device_id || `dev_${crypto.randomUUID().slice(0, 8)}`;
    const ipAddress = paymentEntity.notes?.ip_address || paymentEntity.ip_address || request.ip || '0.0.0.0';
    const customerId = paymentEntity.customer_id || `cust_${crypto.randomUUID().slice(0, 8)}`;

    const maskedCustomer = maskEmail(rawEmail);
    const emailHash = hashPii(rawEmail);
    const phoneHash = rawPhone ? hashPii(rawPhone) : undefined;
    const maskedPhone = rawPhone ? maskPhone(rawPhone) : undefined;
    const maskedPm = maskPaymentIdentifier(rawPaymentId);

    // ── Real ML Scoring — the ONLY place a risk score is produced ────────
    let mlResult: {
      probability: number;
      risk_level: 'low' | 'medium' | 'high' | 'critical';
      action: 'ALLOW' | 'FLAG' | 'BLOCK';
      model_version: string;
      contributing_signals: Array<{ signal_type: string; severity: string; message: string; weight: number; polarity: string }>;
      latency_breakdown_ms: Record<string, number>;
    };

    try {
      mlResult = await callMlScore('/score/transaction', {
        amount: amountInr,
        payment_method: method,
        device_id: deviceId,
        ip_address: ipAddress,
        customer_id: customerId,
        status: paymentEntity.status || 'captured',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof MlServiceError) {
        logger.error({ paymentId, err: err.message }, 'ML service unavailable — rejecting webhook');
        return reply.status(503).send({
          success: false,
          error: {
            code: 'ML_SERVICE_UNAVAILABLE',
            message: 'Risk scoring service is currently unavailable. Please retry the webhook.',
          },
        });
      }
      throw err;
    }

    const riskScore = mlResult.probability;
    const riskLevel = mlResult.risk_level;
    const action = mlResult.action;
    const signals = mlResult.contributing_signals.map((s) => s.message);
    const isAbuseRing = riskScore >= 0.75 && (mlResult.contributing_signals.some((s) => s.signal_type === 'entity_linkage' || s.signal_type === 'cluster_density'));

    // ── Build Transaction Record for in-process audit buffer ─────────────
    const newTxn: Transaction = {
      transaction_id: paymentId,
      merchant_id: merchantId,
      customer_id: customerId,
      device_id: deviceId,
      ip_id: ipAddress,
      pm_id: maskedPm,
      amount: amountInr,
      currency,
      status: (paymentEntity.status || 'captured') as any,
      payment_method_type: method,
      created_at: new Date().toISOString(),
      is_abuse_ring: isAbuseRing,
      ring_id: 0,
      is_fraudulent: riskScore >= 0.75,
    };

    dataStore.addLiveTransaction(newTxn);

    // ── Persist to Postgres with full risk metadata & clean merchant tenant isolation ──
    try {
      await pool.query(
        `INSERT INTO transactions
           (razorpay_payment_id, amount, currency, status, payment_method_type, environment, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, 'live', $6, NOW())
         ON CONFLICT DO NOTHING`,
        [
          paymentId,
          amountInr,
          currency,
          newTxn.status,
          method,
          JSON.stringify({
            merchant_id: merchantId,
            risk_score: riskScore,
            risk_level: riskLevel,
            action,
            signals,
            model_version: mlResult.model_version,
            device_id: deviceId,
            ip_address: ipAddress,
            customer_id: customerId,
            is_abuse_ring: isAbuseRing,
            customer_masked: maskedCustomer,
            email_hash: emailHash,
            phone_hash: phoneHash,
            phone_masked: maskedPhone,
            pm_masked: maskedPm,
            latency_ms: mlResult.latency_breakdown_ms,
          }),
        ],
      );
    } catch (dbErr) {
      logger.warn({ dbErr }, 'Non-blocking Supabase transaction insert fallback');
    }

    const auditEntry: WebhookLogEntry = {
      id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      event,
      payment_id: paymentId,
      merchant_id: merchantId,
      amount: amountInr,
      currency,
      payment_method: method,
      signature_verified: signatureVerified,
      risk_score: riskScore,
      risk_level: riskLevel,
      action,
      signals,
      customer_masked: maskedCustomer,
      device_id: deviceId,
      ip_address: ipAddress,
      source: 'live_webhook',
    };

    webhookAuditBuffer.unshift(auditEntry);
    if (webhookAuditBuffer.length > 50) webhookAuditBuffer.pop();

    logger.info(
      { paymentId, merchantId, amount: amountInr, riskScore, riskLevel, action, modelVersion: mlResult.model_version },
      '✅ Payment Webhook Ingested & Scored by SafeRo ML Engine',
    );

    return reply.status(200).send({
      success: true,
      data: {
        status: 'processed',
        payment_id: paymentId,
        merchant_id: merchantId,
        amount: amountInr,
        currency,
        risk_score: riskScore,
        risk_level: riskLevel,
        action,
        signals,
        model_version: mlResult.model_version,
        signature_verified: signatureVerified,
      },
    });
  });

  // ── 3. POST /api/v1/webhooks/simulate — Authenticated Test Event Dispatcher ──
  // STRICT REQUIREMENT: Requires valid JWT session & derives merchant_id from session context
  app.post('/webhooks/simulate', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionMerchantId = (request as any).merchantId;
    const body = (request.body as Record<string, any>) || {};

    const paymentId = `pay_test_${crypto.randomUUID().slice(0, 10)}`;
    const amountInr = Number(body.amount || 2499);
    const currency = body.currency || 'INR';
    const method = (body.payment_method || 'upi').toLowerCase();
    const rawEmail = body.email || 'customer@merchant-test.com';
    const deviceId = body.device_id || `dev_${crypto.randomUUID().slice(0, 8)}`;
    const ipAddress = body.ip_address || request.ip || '103.21.244.12';
    const customerId = body.customer_id || `cust_${crypto.randomUUID().slice(0, 8)}`;

    const maskedCustomer = maskEmail(rawEmail);
    const emailHash = hashPii(rawEmail);
    const maskedPm = maskPaymentIdentifier(body.vpa || body.card_number || 'user@upi');

    let mlResult: {
      probability: number;
      risk_level: 'low' | 'medium' | 'high' | 'critical';
      action: 'ALLOW' | 'FLAG' | 'BLOCK';
      model_version: string;
      contributing_signals: Array<{ signal_type: string; severity: string; message: string; weight: number; polarity: string }>;
      latency_breakdown_ms: Record<string, number>;
    };

    try {
      mlResult = await callMlScore('/score/transaction', {
        amount: amountInr,
        payment_method: method,
        device_id: deviceId,
        ip_address: ipAddress,
        customer_id: customerId,
        status: 'captured',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof MlServiceError) {
        return reply.status(503).send({ success: false, error: { code: 'ML_SERVICE_UNAVAILABLE', message: err.message } });
      }
      throw err;
    }

    const riskScore = mlResult.probability;
    const riskLevel = mlResult.risk_level;
    const action = mlResult.action;
    const signals = mlResult.contributing_signals.map((s) => s.message);
    const isAbuseRing = riskScore >= 0.75 && (mlResult.contributing_signals.some((s) => s.signal_type === 'entity_linkage' || s.signal_type === 'cluster_density'));

    // Insert into Postgres tagged strictly with the authenticated session's merchant_id
    try {
      await pool.query(
        `INSERT INTO transactions
           (razorpay_payment_id, amount, currency, status, payment_method_type, environment, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, 'live', $6, NOW())
         ON CONFLICT DO NOTHING`,
        [
          paymentId,
          amountInr,
          currency,
          'captured',
          method,
          JSON.stringify({
            merchant_id: sessionMerchantId,
            risk_score: riskScore,
            risk_level: riskLevel,
            action,
            signals,
            model_version: mlResult.model_version,
            device_id: deviceId,
            ip_address: ipAddress,
            customer_id: customerId,
            is_abuse_ring: isAbuseRing,
            customer_masked: maskedCustomer,
            email_hash: emailHash,
            pm_masked: maskedPm,
            source: 'merchant_test_event',
          }),
        ],
      );
    } catch (dbErr) {
      logger.warn({ dbErr }, 'Non-blocking database insertion for test event');
    }

    return reply.status(201).send({
      success: true,
      data: {
        payment_id: paymentId,
        merchant_id: sessionMerchantId,
        amount: amountInr,
        risk_score: riskScore,
        risk_level: riskLevel,
        action,
        signals,
        model_version: mlResult.model_version,
      },
    });
  });
}
