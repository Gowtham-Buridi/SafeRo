import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { pool } from '../database.js';
import { dataStore, type Transaction } from '../dataService.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { callMlScore, MlServiceError } from '../mlClient.js';
import { maskEmail, maskPhone, hashPii, maskPaymentIdentifier } from '../lib/pii.js';
import { authenticate, getAuthContext } from './auth.js';

// In-memory webhook log buffer for live UI monitoring (last 50 events)
export interface WebhookLogEntry {
  id: string;
  timestamp: string;
  event: string;
  payment_id: string;
  merchant_id: string;
  gateway: 'razorpay' | 'stripe' | 'cashfree' | 'custom';
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

// ── Webhook Delivery Diagnostics Log (Every Delivery Attempt) ─────────
export interface WebhookDeliveryLogEntry {
  id: string;
  timestamp: string;
  gateway: 'razorpay' | 'stripe' | 'cashfree' | 'custom';
  url_path: string;
  resolved_merchant_id: string;
  merchant_resolution_source: 'route_param' | 'query_param' | 'header' | 'notes' | 'account_mapping' | 'fallback_default' | 'unresolved';
  signature_verified: boolean;
  signature_failure_reason?: string | null;
  outcome: 'processed' | 'rejected_signature' | 'rejected_other' | 'error';
  reason: string;
  status_code: number;
  payment_id?: string;
  amount?: number;
  currency?: string;
  payload_preview?: string;
}

export const webhookDeliveryLogBuffer: WebhookDeliveryLogEntry[] = [];

export async function recordWebhookDelivery(
  entry: Omit<WebhookDeliveryLogEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string },
): Promise<WebhookDeliveryLogEntry> {
  const fullEntry: WebhookDeliveryLogEntry = {
    id: entry.id || `whlog_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: entry.timestamp || new Date().toISOString(),
    gateway: entry.gateway,
    url_path: entry.url_path,
    resolved_merchant_id: entry.resolved_merchant_id,
    merchant_resolution_source: entry.merchant_resolution_source,
    signature_verified: entry.signature_verified,
    signature_failure_reason: entry.signature_failure_reason || null,
    outcome: entry.outcome,
    reason: entry.reason,
    status_code: entry.status_code,
    payment_id: entry.payment_id,
    amount: entry.amount,
    currency: entry.currency,
    payload_preview: entry.payload_preview ? entry.payload_preview.slice(0, 300) : undefined,
  };

  webhookDeliveryLogBuffer.unshift(fullEntry);
  if (webhookDeliveryLogBuffer.length > 200) webhookDeliveryLogBuffer.pop();

  // Asynchronously attempt to persist to Postgres
  try {
    await pool.query(
      `INSERT INTO webhook_delivery_log
       (gateway, url_path, resolved_merchant_id, merchant_resolution_source, signature_verified, signature_failure_reason, outcome, reason, status_code, payment_id, amount, currency, payload_preview, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        fullEntry.gateway,
        fullEntry.url_path,
        fullEntry.resolved_merchant_id,
        fullEntry.merchant_resolution_source,
        fullEntry.signature_verified,
        fullEntry.signature_failure_reason,
        fullEntry.outcome,
        fullEntry.reason,
        fullEntry.status_code,
        fullEntry.payment_id || null,
        fullEntry.amount || null,
        fullEntry.currency || null,
        fullEntry.payload_preview || null,
        fullEntry.timestamp,
      ],
    ).catch(() => {});
  } catch {
    // Non-blocking fallback
  }

  return fullEntry;
}

export interface MerchantResolutionResult {
  merchantId: string;
  source: 'route_param' | 'query_param' | 'header' | 'notes' | 'account_mapping' | 'fallback_default' | 'unresolved';
}

/**
 * 5-tier waterfall resolution for incoming webhook merchant tenant identity:
 * 1. Webhook endpoint URL route param: `/webhooks/:gateway/:merchantId`
 * 2. Webhook endpoint URL query param: `?merchant_id=m_xyz`
 * 3. Integration header: `X-Merchant-ID: m_xyz` or `X-Safero-Merchant-ID: m_xyz`
 * 4. Checkout notes/metadata: `payload.payment.entity.notes.merchant_id` or `metadata.merchant_id`
 * 5. Account ID DB mapping: `body.account_id` -> `merchants.razorpay_merchant_id`
 * 6. Default connected store fallback: `'m_ecommerce_01'`
 */
export async function resolveWebhookMerchantDetails(
  request: FastifyRequest,
  body: any,
  paymentEntity: any,
): Promise<MerchantResolutionResult> {
  const paramMerchant = (request.params as any)?.merchantId || (request.params as any)?.merchant_id;
  if (paramMerchant && typeof paramMerchant === 'string' && paramMerchant.trim() !== '') {
    return { merchantId: paramMerchant.trim(), source: 'route_param' };
  }

  const queryMerchant = (request.query as any)?.merchant_id || (request.query as any)?.merchantId;
  if (queryMerchant && typeof queryMerchant === 'string' && queryMerchant.trim() !== '') {
    return { merchantId: queryMerchant.trim(), source: 'query_param' };
  }

  const headerMerchant =
    (request.headers['x-merchant-id'] as string) || (request.headers['x-safero-merchant-id'] as string);
  if (headerMerchant && typeof headerMerchant === 'string' && headerMerchant.trim() !== '') {
    return { merchantId: headerMerchant.trim(), source: 'header' };
  }

  const notesMerchant =
    paymentEntity?.notes?.merchant_id ||
    paymentEntity?.notes?.merchantId ||
    paymentEntity?.notes?.userId ||
    paymentEntity?.metadata?.merchant_id ||
    body?.metadata?.merchant_id;
  if (notesMerchant && typeof notesMerchant === 'string' && notesMerchant.trim() !== '') {
    return { merchantId: notesMerchant.trim(), source: 'notes' };
  }

  const accountId = body?.account_id || paymentEntity?.account_id || body?.account;
  if (accountId) {
    try {
      const res = await pool.query('SELECT id FROM merchants WHERE razorpay_merchant_id = $1 LIMIT 1', [accountId]);
      if (res.rows.length > 0) return { merchantId: res.rows[0].id, source: 'account_mapping' };
    } catch {
      // Non-blocking fallback
    }
  }

  return { merchantId: 'm_ecommerce_01', source: 'fallback_default' };
}

export async function resolveWebhookMerchantId(
  request: FastifyRequest,
  body: any,
  paymentEntity: any,
): Promise<string> {
  const res = await resolveWebhookMerchantDetails(request, body, paymentEntity);
  return res.merchantId;
}

/**
 * Unified ML scoring and transaction persistence pipeline for all webhook providers.
 */
async function processWebhookTransaction(opts: {
  gateway: 'razorpay' | 'stripe' | 'cashfree' | 'custom';
  paymentId: string;
  merchantId: string;
  resolutionSource?: 'route_param' | 'query_param' | 'header' | 'notes' | 'account_mapping' | 'fallback_default' | 'unresolved';
  urlPath?: string;
  amountInr: number;
  currency: string;
  method: string;
  status: string;
  rawEmail: string;
  rawPhone: string;
  rawPaymentId: string;
  deviceId: string;
  ipAddress: string;
  customerId: string;
  event: string;
  signatureVerified: boolean;
  signatureFailureReason?: string | null;
  rawPayloadPreview?: string;
  reply: FastifyReply;
}) {
  const maskedCustomer = maskEmail(opts.rawEmail);
  const emailHash = hashPii(opts.rawEmail);
  const phoneHash = opts.rawPhone ? hashPii(opts.rawPhone) : undefined;
  const maskedPhone = opts.rawPhone ? maskPhone(opts.rawPhone) : undefined;
  const maskedPm = maskPaymentIdentifier(opts.rawPaymentId);

  // ── Real ML Scoring ───────────────────────────────────────────────────
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
      amount: opts.amountInr,
      payment_method: opts.method,
      device_id: opts.deviceId,
      ip_address: opts.ipAddress,
      customer_id: opts.customerId,
      status: opts.status || 'captured',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof MlServiceError) {
      logger.error({ paymentId: opts.paymentId, gateway: opts.gateway, err: err.message }, 'ML service unavailable — rejecting webhook');
      await recordWebhookDelivery({
        gateway: opts.gateway,
        url_path: opts.urlPath || `/webhooks/${opts.gateway}`,
        resolved_merchant_id: opts.merchantId,
        merchant_resolution_source: opts.resolutionSource || 'fallback_default',
        signature_verified: opts.signatureVerified,
        signature_failure_reason: opts.signatureFailureReason || null,
        outcome: 'error',
        reason: 'Risk scoring service (ML) unavailable (HTTP 503)',
        status_code: 503,
        payment_id: opts.paymentId,
        amount: opts.amountInr,
        currency: opts.currency,
        payload_preview: opts.rawPayloadPreview,
      });
      return opts.reply.status(503).send({
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
    transaction_id: opts.paymentId,
    merchant_id: opts.merchantId,
    customer_id: opts.customerId,
    device_id: opts.deviceId,
    ip_id: opts.ipAddress,
    pm_id: maskedPm,
    amount: opts.amountInr,
    currency: opts.currency,
    status: (opts.status || 'captured') as any,
    payment_method_type: opts.method,
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
        opts.paymentId,
        opts.amountInr,
        opts.currency,
        newTxn.status,
        opts.method,
        JSON.stringify({
          gateway: opts.gateway,
          merchant_id: opts.merchantId,
          risk_score: riskScore,
          risk_level: riskLevel,
          action,
          signals,
          model_version: mlResult.model_version,
          device_id: opts.deviceId,
          ip_address: opts.ipAddress,
          customer_id: opts.customerId,
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
  } catch (dbErr: any) {
    logger.error({ err: dbErr?.message || dbErr }, 'Failed to insert live transaction into Postgres');
  }

  const auditEntry: WebhookLogEntry = {
    id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    event: opts.event,
    payment_id: opts.paymentId,
    merchant_id: opts.merchantId,
    gateway: opts.gateway,
    amount: opts.amountInr,
    currency: opts.currency,
    payment_method: opts.method,
    signature_verified: opts.signatureVerified,
    risk_score: riskScore,
    risk_level: riskLevel,
    action,
    signals,
    customer_masked: maskedCustomer,
    device_id: opts.deviceId,
    ip_address: opts.ipAddress,
    source: 'live_webhook',
  };

  webhookAuditBuffer.unshift(auditEntry);
  if (webhookAuditBuffer.length > 50) webhookAuditBuffer.pop();

  // ── Log to durable delivery log ──────────────────────────────────────
  await recordWebhookDelivery({
    gateway: opts.gateway,
    url_path: opts.urlPath || `/webhooks/${opts.gateway}`,
    resolved_merchant_id: opts.merchantId,
    merchant_resolution_source: opts.resolutionSource || 'fallback_default',
    signature_verified: opts.signatureVerified,
    signature_failure_reason: opts.signatureFailureReason || null,
    outcome: 'processed',
    reason: `Payment captured & scored by SafeRo ML Engine (Risk: ${(riskScore * 100).toFixed(0)}%, Action: ${action})`,
    status_code: 200,
    payment_id: opts.paymentId,
    amount: opts.amountInr,
    currency: opts.currency,
    payload_preview: opts.rawPayloadPreview,
  });

  logger.info(
    { gateway: opts.gateway, paymentId: opts.paymentId, merchantId: opts.merchantId, amount: opts.amountInr, riskScore, riskLevel, action },
    `✅ [${opts.gateway.toUpperCase()}] Payment Webhook Ingested & Scored by SafeRo ML Engine`,
  );

  return opts.reply.status(200).send({
    success: true,
    status: 'scored',
    data: {
      transaction_id: opts.paymentId,
      gateway: opts.gateway,
      merchant_id: opts.merchantId,
      amount: opts.amountInr,
      risk_score: riskScore,
      risk_level: riskLevel,
      action,
      model_version: mlResult.model_version,
      signals,
      is_abuse_ring: isAbuseRing,
      customer_masked: maskedCustomer,
      timestamp: auditEntry.timestamp,
    },
  });
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {

  // ── 1. GET /api/v1/webhooks/history — Live Webhook Feed ────────────────
  app.get('/webhooks/history', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      data: webhookAuditBuffer.slice(0, 30),
    });
  });

  // ── 2. POST /webhooks/razorpay & /webhooks/razorpay/:merchantId ──────
  const handleRazorpayWebhook = async (
    request: FastifyRequest<{ Params: { merchantId?: string } }>,
    reply: FastifyReply,
  ) => {
    const rawBody = (request as any).rawBody || JSON.stringify(request.body || {});
    const signature = (request.headers['x-razorpay-signature'] as string) || '';
    const secret = config.razorpay.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || '';

    const body = (request.body as any) || {};
    const event = body.event || 'payment.captured';
    const paymentEntity = body.payload?.payment?.entity || body.payment || body;

    const paymentId = paymentEntity.id || `pay_${crypto.randomUUID().slice(0, 10)}`;
    const resolution = await resolveWebhookMerchantDetails(request, body, paymentEntity);
    const merchantId = resolution.merchantId;
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

    let signatureVerified = false;

    if (secret) {
      if (!signature) {
        logger.warn('Razorpay Webhook missing X-Razorpay-Signature header');
        await recordWebhookDelivery({
          gateway: 'razorpay',
          url_path: request.url,
          resolved_merchant_id: merchantId,
          merchant_resolution_source: resolution.source,
          signature_verified: false,
          signature_failure_reason: 'missing_header',
          outcome: 'rejected_signature',
          reason: 'Missing X-Razorpay-Signature header',
          status_code: 401,
          payment_id: paymentId,
          amount: amountInr,
          currency,
          payload_preview: rawBody,
        });
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Missing Razorpay signature header' },
        });
      }

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      if (
        expectedSignature.length === signature.length &&
        crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))
      ) {
        signatureVerified = true;
      } else {
        logger.warn({ signature }, '⚠️ Razorpay Webhook HMAC signature verification failed');
        await recordWebhookDelivery({
          gateway: 'razorpay',
          url_path: request.url,
          resolved_merchant_id: merchantId,
          merchant_resolution_source: resolution.source,
          signature_verified: false,
          signature_failure_reason: 'mismatched_signature',
          outcome: 'rejected_signature',
          reason: 'HMAC signature verification failed (mismatched X-Razorpay-Signature)',
          status_code: 401,
          payment_id: paymentId,
          amount: amountInr,
          currency,
          payload_preview: rawBody,
        });
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'HMAC signature verification failed' },
        });
      }
    } else {
      signatureVerified = false;
    }

    return processWebhookTransaction({
      gateway: 'razorpay',
      paymentId,
      merchantId,
      resolutionSource: resolution.source,
      urlPath: request.url,
      amountInr,
      currency,
      method,
      status: paymentEntity.status || 'captured',
      rawEmail,
      rawPhone,
      rawPaymentId,
      deviceId,
      ipAddress,
      customerId,
      event,
      signatureVerified,
      rawPayloadPreview: rawBody,
      reply,
    });
  };

  app.post('/webhooks/razorpay', handleRazorpayWebhook);
  app.post('/webhooks/razorpay/:merchantId', handleRazorpayWebhook);

  // ── 3. POST /webhooks/stripe & /webhooks/stripe/:merchantId ──────────
  const handleStripeWebhook = async (
    request: FastifyRequest<{ Params: { merchantId?: string } }>,
    reply: FastifyReply,
  ) => {
    const rawBody = (request as any).rawBody || JSON.stringify(request.body || {});
    const sigHeader = (request.headers['stripe-signature'] as string) || '';
    const secret = (config as any).stripe?.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || '';

    const body = (request.body as any) || {};
    const event = body.type || 'payment_intent.succeeded';
    const obj = body.data?.object || body;

    const paymentId = obj.id || `pi_${crypto.randomUUID().slice(0, 10)}`;
    const resolution = await resolveWebhookMerchantDetails(request, body, obj);
    const merchantId = resolution.merchantId;
    const rawAmount = Number(obj.amount || obj.amount_received || 2999);
    const amountInr = rawAmount > 100 ? rawAmount / 100 : rawAmount;
    const currency = (obj.currency || 'INR').toUpperCase();
    const method = (obj.payment_method_types?.[0] || obj.payment_method_details?.type || 'card').toLowerCase();
    const rawEmail = obj.receipt_email || obj.billing_details?.email || obj.customer_email || 'customer@stripe.com';
    const rawPhone = obj.billing_details?.phone || '';
    const rawPaymentId = obj.payment_method || obj.charges?.data?.[0]?.payment_method || `pm_stripe_${crypto.randomUUID().slice(0, 8)}`;
    const deviceId = obj.metadata?.device_id || `dev_stripe_${crypto.randomUUID().slice(0, 8)}`;
    const ipAddress = obj.metadata?.ip_address || request.ip || '0.0.0.0';
    const customerId = obj.customer || `cust_stripe_${crypto.randomUUID().slice(0, 8)}`;

    let signatureVerified = false;

    if (secret) {
      if (!sigHeader) {
        logger.warn('⚠️ Stripe Webhook missing Stripe-Signature header');
        await recordWebhookDelivery({
          gateway: 'stripe',
          url_path: request.url,
          resolved_merchant_id: merchantId,
          merchant_resolution_source: resolution.source,
          signature_verified: false,
          signature_failure_reason: 'missing_header',
          outcome: 'rejected_signature',
          reason: 'Missing Stripe-Signature header',
          status_code: 401,
          payment_id: paymentId,
          amount: amountInr,
          currency,
          payload_preview: rawBody,
        });
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Missing Stripe-Signature header' },
        });
      }

      const parts = sigHeader.split(',');
      let timestampStr = '';
      const v1Signatures: string[] = [];

      for (const part of parts) {
        const [key, val] = part.trim().split('=');
        if (key === 't' && val) timestampStr = val;
        else if (key === 'v1' && val) v1Signatures.push(val);
      }

      if (!timestampStr || v1Signatures.length === 0) {
        logger.warn({ sigHeader }, '⚠️ Stripe Webhook signature header malformed');
        await recordWebhookDelivery({
          gateway: 'stripe',
          url_path: request.url,
          resolved_merchant_id: merchantId,
          merchant_resolution_source: resolution.source,
          signature_verified: false,
          signature_failure_reason: 'malformed_header',
          outcome: 'rejected_signature',
          reason: 'Stripe signature header format invalid (missing t= or v1=)',
          status_code: 401,
          payment_id: paymentId,
          amount: amountInr,
          currency,
          payload_preview: rawBody,
        });
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Stripe signature header format invalid' },
        });
      }

      const timestamp = parseInt(timestampStr, 10);
      const now = Math.floor(Date.now() / 1000);
      if (isNaN(timestamp) || Math.abs(now - timestamp) > 300) {
        logger.warn({ timestamp, now }, '⚠️ Stripe Webhook timestamp outside 5-minute tolerance window');
        await recordWebhookDelivery({
          gateway: 'stripe',
          url_path: request.url,
          resolved_merchant_id: merchantId,
          merchant_resolution_source: resolution.source,
          signature_verified: false,
          signature_failure_reason: 'expired_timestamp',
          outcome: 'rejected_signature',
          reason: 'Stripe webhook timestamp expired (replay attack tolerance exceeded)',
          status_code: 401,
          payment_id: paymentId,
          amount: amountInr,
          currency,
          payload_preview: rawBody,
        });
        return reply.status(401).send({
          success: false,
          error: { code: 'EXPIRED_SIGNATURE', message: 'Stripe webhook timestamp expired (replay attack tolerance exceeded)' },
        });
      }

      const signedPayload = `${timestampStr}.${rawBody}`;
      const expectedSig = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      const isValid = v1Signatures.some((v1) => {
        return (
          v1.length === expectedSig.length &&
          crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expectedSig))
        );
      });

      if (isValid) {
        signatureVerified = true;
      } else {
        logger.warn({ sigHeader }, '⚠️ Stripe Webhook HMAC signature mismatch');
        await recordWebhookDelivery({
          gateway: 'stripe',
          url_path: request.url,
          resolved_merchant_id: merchantId,
          merchant_resolution_source: resolution.source,
          signature_verified: false,
          signature_failure_reason: 'mismatched_signature',
          outcome: 'rejected_signature',
          reason: 'Stripe signature verification failed (HMAC mismatch)',
          status_code: 401,
          payment_id: paymentId,
          amount: amountInr,
          currency,
          payload_preview: rawBody,
        });
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Stripe signature verification failed' },
        });
      }
    } else {
      signatureVerified = false;
    }

    return processWebhookTransaction({
      gateway: 'stripe',
      paymentId,
      merchantId,
      resolutionSource: resolution.source,
      urlPath: request.url,
      amountInr,
      currency,
      method,
      status: obj.status === 'succeeded' ? 'captured' : (obj.status || 'captured'),
      rawEmail,
      rawPhone,
      rawPaymentId,
      deviceId,
      ipAddress,
      customerId,
      event,
      signatureVerified,
      rawPayloadPreview: rawBody,
      reply,
    });
  };

  app.post('/webhooks/stripe', handleStripeWebhook);
  app.post('/webhooks/stripe/:merchantId', handleStripeWebhook);

  // ── 4. POST /webhooks/cashfree & /webhooks/cashfree/:merchantId ───────
  const handleCashfreeWebhook = async (
    request: FastifyRequest<{ Params: { merchantId?: string } }>,
    reply: FastifyReply,
  ) => {
    const rawBody = (request as any).rawBody || JSON.stringify(request.body || {});
    const signature = (request.headers['x-webhook-signature'] as string) || (request.headers['x-cashfree-signature'] as string) || '';
    const timestampStr = (request.headers['x-webhook-timestamp'] as string) || (request.headers['x-cashfree-timestamp'] as string) || '';
    const secret = (config as any).cashfree?.webhookSecret || process.env.CASHFREE_WEBHOOK_SECRET || '';

    const body = (request.body as any) || {};
    const event = body.type || body.event || 'PAYMENT_SUCCESS_WEBHOOK';
    const payment = body.data?.payment || body.data?.order || body.data || body;
    const customer = body.data?.customer_details || body.customer_details || {};

    const paymentId = payment.cf_payment_id ? `cf_${payment.cf_payment_id}` : (payment.payment_id || `cf_${crypto.randomUUID().slice(0, 10)}`);
    const resolution = await resolveWebhookMerchantDetails(request, body, payment);
    const merchantId = resolution.merchantId;
    const amountInr = Number(payment.payment_amount || payment.order_amount || 1999);
    const currency = (payment.payment_currency || payment.order_currency || 'INR').toUpperCase();
    const method = (payment.payment_group || payment.payment_mode || 'upi').toLowerCase();
    const rawEmail = customer.customer_email || 'customer@cashfree.com';
    const rawPhone = customer.customer_phone || '';
    const rawPaymentId = payment.payment_method || `pm_cf_${crypto.randomUUID().slice(0, 8)}`;
    const deviceId = customer.device_id || body.device_id || `dev_cf_${crypto.randomUUID().slice(0, 8)}`;
    const ipAddress = body.ip_address || request.ip || '0.0.0.0';
    const customerId = customer.customer_id || `cust_cf_${crypto.randomUUID().slice(0, 8)}`;

    let signatureVerified = false;

    if (secret) {
      if (!signature) {
        logger.warn('⚠️ Cashfree Webhook missing x-webhook-signature header');
        await recordWebhookDelivery({
          gateway: 'cashfree',
          url_path: request.url,
          resolved_merchant_id: merchantId,
          merchant_resolution_source: resolution.source,
          signature_verified: false,
          signature_failure_reason: 'missing_header',
          outcome: 'rejected_signature',
          reason: 'Missing Cashfree signature header',
          status_code: 401,
          payment_id: paymentId,
          amount: amountInr,
          currency,
          payload_preview: rawBody,
        });
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Missing Cashfree signature header' },
        });
      }

      if (timestampStr) {
        const timestamp = parseInt(timestampStr, 10);
        const now = Math.floor(Date.now() / 1000);
        if (!isNaN(timestamp) && Math.abs(now - timestamp) > 300) {
          logger.warn({ timestamp, now }, '⚠️ Cashfree Webhook timestamp outside 5-minute tolerance window');
          await recordWebhookDelivery({
            gateway: 'cashfree',
            url_path: request.url,
            resolved_merchant_id: merchantId,
            merchant_resolution_source: resolution.source,
            signature_verified: false,
            signature_failure_reason: 'expired_timestamp',
            outcome: 'rejected_signature',
            reason: 'Cashfree webhook timestamp expired (> 300 seconds)',
            status_code: 401,
            payment_id: paymentId,
            amount: amountInr,
            currency,
            payload_preview: rawBody,
          });
          return reply.status(401).send({
            success: false,
            error: { code: 'EXPIRED_SIGNATURE', message: 'Cashfree webhook timestamp expired' },
          });
        }
      }

      const payloadToSign = timestampStr ? `${timestampStr}${rawBody}` : rawBody;
      const expectedBase64 = crypto
        .createHmac('sha256', secret)
        .update(payloadToSign)
        .digest('base64');
      const expectedHex = crypto
        .createHmac('sha256', secret)
        .update(payloadToSign)
        .digest('hex');

      const matchesBase64 =
        expectedBase64.length === signature.length &&
        crypto.timingSafeEqual(Buffer.from(expectedBase64), Buffer.from(signature));
      const matchesHex =
        expectedHex.length === signature.length &&
        crypto.timingSafeEqual(Buffer.from(expectedHex), Buffer.from(signature));

      if (matchesBase64 || matchesHex) {
        signatureVerified = true;
      } else {
        logger.warn({ signature }, '⚠️ Cashfree Webhook HMAC signature verification failed');
        await recordWebhookDelivery({
          gateway: 'cashfree',
          url_path: request.url,
          resolved_merchant_id: merchantId,
          merchant_resolution_source: resolution.source,
          signature_verified: false,
          signature_failure_reason: 'mismatched_signature',
          outcome: 'rejected_signature',
          reason: 'Cashfree signature verification failed (HMAC mismatch)',
          status_code: 401,
          payment_id: paymentId,
          amount: amountInr,
          currency,
          payload_preview: rawBody,
        });
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Cashfree signature verification failed' },
        });
      }
    } else {
      signatureVerified = false;
    }

    return processWebhookTransaction({
      gateway: 'cashfree',
      paymentId,
      merchantId,
      resolutionSource: resolution.source,
      urlPath: request.url,
      amountInr,
      currency,
      method,
      status: payment.payment_status === 'SUCCESS' ? 'captured' : 'failed',
      rawEmail,
      rawPhone,
      rawPaymentId,
      deviceId,
      ipAddress,
      customerId,
      event,
      signatureVerified,
      rawPayloadPreview: rawBody,
      reply,
    });
  };

  app.post('/webhooks/cashfree', handleCashfreeWebhook);
  app.post('/webhooks/cashfree/:merchantId', handleCashfreeWebhook);

  // ── 5. POST /webhooks/custom & /webhooks/custom/:merchantId ────
  const handleCustomWebhook = async (
    request: FastifyRequest<{ Params: { merchantId?: string } }>,
    reply: FastifyReply,
  ) => {
    const rawBody = (request as any).rawBody || JSON.stringify(request.body || {});
    const body = (request.body as any) || {};
    const signature = (request.headers['x-webhook-signature'] as string) || (request.headers['x-custom-signature'] as string) || '';
    const resolution = await resolveWebhookMerchantDetails(request, body, body);
    const merchantId = resolution.merchantId;
    const customSecret = process.env.CUSTOM_WEBHOOK_SECRET || '';

    const paymentId = body.payment_id || body.transaction_id || `txn_${crypto.randomUUID().slice(0, 10)}`;
    const amountInr = Number(body.amount || 1000);
    const currency = (body.currency || 'INR').toUpperCase();
    const method = (body.payment_method || body.method || 'card').toLowerCase();
    const rawEmail = body.email || body.customer_email || 'customer@store.com';
    const rawPhone = body.phone || body.customer_phone || '';
    const rawPaymentId = body.card_id || body.vpa || body.pm_id || `pm_${crypto.randomUUID().slice(0, 8)}`;
    const deviceId = body.device_id || `dev_${crypto.randomUUID().slice(0, 8)}`;
    const ipAddress = body.ip_address || request.ip || '0.0.0.0';
    const customerId = body.customer_id || `cust_${crypto.randomUUID().slice(0, 8)}`;

    let signatureVerified = false;

    if (customSecret) {
      if (!signature) {
        logger.warn({ merchantId }, '⚠️ Custom Webhook missing signature header when secret is configured');
        await recordWebhookDelivery({
          gateway: 'custom',
          url_path: request.url,
          resolved_merchant_id: merchantId,
          merchant_resolution_source: resolution.source,
          signature_verified: false,
          signature_failure_reason: 'missing_header',
          outcome: 'rejected_signature',
          reason: 'Missing custom webhook signature header',
          status_code: 401,
          payment_id: paymentId,
          amount: amountInr,
          currency,
          payload_preview: rawBody,
        });
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Missing custom webhook signature header' },
        });
      }

      const expectedHex = crypto.createHmac('sha256', customSecret).update(rawBody).digest('hex');
      if (
        expectedHex.length === signature.length &&
        crypto.timingSafeEqual(Buffer.from(expectedHex), Buffer.from(signature))
      ) {
        signatureVerified = true;
      } else {
        logger.warn({ signature, merchantId }, '⚠️ Custom Webhook HMAC signature verification failed');
        await recordWebhookDelivery({
          gateway: 'custom',
          url_path: request.url,
          resolved_merchant_id: merchantId,
          merchant_resolution_source: resolution.source,
          signature_verified: false,
          signature_failure_reason: 'mismatched_signature',
          outcome: 'rejected_signature',
          reason: 'Custom webhook signature verification failed (HMAC mismatch)',
          status_code: 401,
          payment_id: paymentId,
          amount: amountInr,
          currency,
          payload_preview: rawBody,
        });
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Custom webhook signature verification failed' },
        });
      }
    } else {
      signatureVerified = false;
      logger.info({ merchantId }, 'Custom webhook ingested unverified — no secret configured');
    }

    return processWebhookTransaction({
      gateway: 'custom',
      paymentId,
      merchantId,
      resolutionSource: resolution.source,
      urlPath: request.url,
      amountInr,
      currency,
      method,
      status: body.status || 'captured',
      rawEmail,
      rawPhone,
      rawPaymentId,
      deviceId,
      ipAddress,
      customerId,
      event: 'custom.transaction_ingested',
      signatureVerified,
      signatureFailureReason: !customSecret ? 'missing_secret_configured' : null,
      rawPayloadPreview: rawBody,
      reply,
    });
  };

  app.post('/webhooks/custom', handleCustomWebhook);
  app.post('/webhooks/custom/:merchantId', handleCustomWebhook);

  // ── 6. GET /webhooks/diagnostics — Self-Service Delivery Diagnostics ───
  const handleDiagnostics = async (request: FastifyRequest, reply: FastifyReply) => {
    const authCtx = getAuthContext(request);
    const targetMerchantId = authCtx?.merchantId || (request.query as any)?.merchant_id || 'm_ecommerce_01';

    // 1. Fetch from Postgres if available
    let dbLogs: WebhookDeliveryLogEntry[] = [];
    try {
      const res = await pool.query(
        `SELECT id, timestamp, gateway, url_path, resolved_merchant_id, merchant_resolution_source,
                signature_verified, signature_failure_reason, outcome, reason, status_code, payment_id,
                amount, currency, payload_preview
         FROM webhook_delivery_log
         WHERE resolved_merchant_id = $1 OR url_path LIKE $2 OR resolved_merchant_id = 'fallback_default'
         ORDER BY timestamp DESC
         LIMIT 50`,
        [targetMerchantId, `%${targetMerchantId}%`],
      );
      dbLogs = res.rows.map((r: any) => ({
        id: r.id,
        timestamp: new Date(r.timestamp).toISOString(),
        gateway: r.gateway,
        url_path: r.url_path,
        resolved_merchant_id: r.resolved_merchant_id,
        merchant_resolution_source: r.merchant_resolution_source,
        signature_verified: r.signature_verified,
        signature_failure_reason: r.signature_failure_reason,
        outcome: r.outcome,
        reason: r.reason,
        status_code: r.status_code,
        payment_id: r.payment_id,
        amount: r.amount ? Number(r.amount) : undefined,
        currency: r.currency,
        payload_preview: r.payload_preview,
      }));
    } catch {
      // Non-blocking fallback to in-memory buffer
    }

    // 2. Merge DB logs with in-memory buffer, deduplicating by ID or timestamp+paymentId
    const seen = new Set<string>();
    const combined: WebhookDeliveryLogEntry[] = [];

    for (const log of [...webhookDeliveryLogBuffer, ...dbLogs]) {
      const key = log.id || `${log.timestamp}_${log.payment_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        if (
          log.resolved_merchant_id === targetMerchantId ||
          log.url_path.includes(targetMerchantId) ||
          log.merchant_resolution_source === 'fallback_default' ||
          log.resolved_merchant_id === 'fallback_default' ||
          log.resolved_merchant_id === 'UNRESOLVED'
        ) {
          combined.push(log);
        }
      }
    }

    combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const recent20 = combined.slice(0, 20);

    // 3. Diagnostic calculations
    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const deliveries24h = combined.filter((l) => {
      const ts = new Date(l.timestamp).getTime();
      return (l.resolved_merchant_id === targetMerchantId || l.url_path.includes(targetMerchantId)) && ts >= twentyFourHoursAgo;
    });

    const zeroDeliveriesIn24h = deliveries24h.length === 0;

    const unattributedRecent = combined.filter((l) => {
      const ts = new Date(l.timestamp).getTime();
      return (
        (l.merchant_resolution_source === 'fallback_default' ||
          l.resolved_merchant_id === 'fallback_default' ||
          l.resolved_merchant_id === 'UNRESOLVED') &&
        ts >= twentyFourHoursAgo
      );
    });

    let advice = 'Webhook deliveries are active and operational.';
    if (zeroDeliveriesIn24h) {
      advice =
        'No webhook deliveries received in the last 24 hours. Confirm the URL below is registered in your Razorpay Dashboard → Settings → Webhooks, and that it matches exactly.';
    } else if (unattributedRecent.length > 0) {
      advice = `Notice: Found ${unattributedRecent.length} recent unattributed events received at generic URL variants. Register your dedicated merchant URL to auto-link every transaction.`;
    }

    return reply.send({
      success: true,
      data: {
        merchant_id: targetMerchantId,
        recent_deliveries: recent20,
        total_deliveries: combined.length,
        deliveries_24h_count: deliveries24h.length,
        zero_deliveries_in_24h: zeroDeliveriesIn24h,
        unattributed_count: unattributedRecent.length,
        advice,
      },
    });
  };

  app.get('/webhooks/diagnostics', { preHandler: [authenticate] }, handleDiagnostics);

  // ── 7. POST /webhooks/self-test — Test Real Production Webhook Path ───
  app.post(
    '/webhooks/self-test',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authCtx = getAuthContext(request);
      const merchantId = authCtx?.merchantId || 'm_ecommerce_01';
      const body = (request.body as any) || {};
      const gateway = body.gateway || 'razorpay';

      const paymentId = `pay_selftest_${crypto.randomUUID().slice(0, 8)}`;
      const amountPaise = 50000; // Rs 500
      const testPayload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              amount: amountPaise,
              currency: 'INR',
              status: 'captured',
              method: 'upi',
              email: 'self-test@safero.internal',
              contact: '+919876543210',
              vpa: 'selftest@upi',
              notes: {
                merchant_id: merchantId,
                source: 'self_test_runner',
              },
            },
          },
        },
      };

      const rawBody = JSON.stringify(testPayload);
      const secret = config.razorpay.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || 'rzpsec_test_razorpay_secret_99999';
      const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const targetUrl = `/webhooks/razorpay/${encodeURIComponent(merchantId)}`;

      // Execute full production HTTP pipeline via Fastify injection
      const result = await app.inject({
        method: 'POST',
        url: targetUrl,
        headers: {
          'content-type': 'application/json',
          'x-razorpay-signature': signature,
        },
        payload: rawBody,
      });

      let parsedRes: any = {};
      try {
        parsedRes = JSON.parse(result.body);
      } catch {
        parsedRes = { raw: result.body };
      }

      return reply.send({
        success: result.statusCode === 200,
        data: {
          status_code: result.statusCode,
          signature_verified: result.statusCode === 200,
          target_url: targetUrl,
          resolved_merchant_id: merchantId,
          transaction_id: paymentId,
          amount_inr: 500,
          response: parsedRes,
          message:
            result.statusCode === 200
              ? 'Self-test webhook executed successfully through the complete production HMAC verification & ML pipeline!'
              : `Self-test webhook returned status code ${result.statusCode}: ${parsedRes.error?.message || 'Verification or ingestion failed'}`,
        },
      });
    },
  );

  // ── 6. POST /api/v1/webhooks/simulate — Authenticated Merchant Simulator
  app.post(
    '/webhooks/simulate',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authCtx = getAuthContext(request);
      if (!authCtx || !authCtx.merchantId || authCtx.userId === 'u_anonymous') {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Valid session required to simulate events' },
        });
      }

      const body = (request.body as any) || {};
      const paymentId = body.payment_id || `sim_${crypto.randomUUID().slice(0, 10)}`;
      const amountInr = Number(body.amount || 2499);
      const currency = body.currency || 'INR';
      const method = (body.method || body.payment_method_type || 'upi').toLowerCase();
      const rawEmail = body.email || `simulated_${Date.now()}@customer.com`;
      const rawPhone = body.phone || '';
      const rawPaymentId = body.vpa || body.card_id || `pm_sim_${crypto.randomUUID().slice(0, 6)}`;
      const deviceId = body.device_id || `dev_sim_${crypto.randomUUID().slice(0, 6)}`;
      const ipAddress = body.ip_address || request.ip || '127.0.0.1';
      const customerId = body.customer_id || `cust_sim_${crypto.randomUUID().slice(0, 6)}`;
      const merchantId = authCtx.merchantId;

      const maskedCustomer = maskEmail(rawEmail);
      const emailHash = hashPii(rawEmail);
      const phoneHash = rawPhone ? hashPii(rawPhone) : undefined;
      const maskedPhone = rawPhone ? maskPhone(rawPhone) : undefined;
      const maskedPm = maskPaymentIdentifier(rawPaymentId);

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
          logger.error({ paymentId, err: err.message }, 'ML service unavailable for simulated transaction');
          return reply.status(503).send({
            success: false,
            error: {
              code: 'ML_SERVICE_UNAVAILABLE',
              message: 'Risk scoring service is offline. Could not complete simulation.',
            },
          });
        }
        throw err;
      }

      const riskScore = mlResult.probability;
      const riskLevel = mlResult.risk_level;
      const action = mlResult.action;
      const signals = mlResult.contributing_signals.map((s) => s.message);
      const isAbuseRing = riskScore >= 0.75;

      const newTxn: Transaction = {
        transaction_id: paymentId,
        merchant_id: merchantId,
        customer_id: customerId,
        device_id: deviceId,
        ip_id: ipAddress,
        pm_id: maskedPm,
        amount: amountInr,
        currency,
        status: 'captured',
        payment_method_type: method,
        created_at: new Date().toISOString(),
        is_abuse_ring: isAbuseRing,
        ring_id: 0,
        is_fraudulent: riskScore >= 0.75,
      };

      dataStore.addLiveTransaction(newTxn);

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
              gateway: 'simulator',
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
              simulated: true,
            }),
          ],
        );
      } catch (dbErr) {
        logger.warn({ dbErr }, 'Non-blocking DB insert fallback for simulated transaction');
      }

      const auditEntry: WebhookLogEntry = {
        id: `wh_sim_${Date.now()}`,
        timestamp: new Date().toISOString(),
        event: 'merchant.simulated_payment',
        payment_id: paymentId,
        merchant_id: merchantId,
        gateway: 'custom',
        amount: amountInr,
        currency,
        payment_method: method,
        signature_verified: true,
        risk_score: riskScore,
        risk_level: riskLevel,
        action,
        signals,
        customer_masked: maskedCustomer,
        device_id: deviceId,
        ip_address: ipAddress,
        source: 'merchant_test_event',
      };

      webhookAuditBuffer.unshift(auditEntry);
      if (webhookAuditBuffer.length > 50) webhookAuditBuffer.pop();

      return reply.status(201).send({
        success: true,
        message: 'Simulated payment processed & scored successfully',
        data: {
          transaction_id: paymentId,
          merchant_id: merchantId,
          amount: amountInr,
          risk_score: riskScore,
          risk_level: riskLevel,
          action,
          signals,
          model_version: mlResult.model_version,
          customer_masked: maskedCustomer,
        },
      });
    },
  );
}
