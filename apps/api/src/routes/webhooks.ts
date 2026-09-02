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

/**
 * 5-tier waterfall resolution for incoming webhook merchant tenant identity:
 * 1. Webhook endpoint URL route param: `/webhooks/:gateway/:merchantId`
 * 2. Webhook endpoint URL query param: `?merchant_id=m_xyz`
 * 3. Integration header: `X-Merchant-ID: m_xyz` or `X-Safero-Merchant-ID: m_xyz`
 * 4. Checkout notes/metadata: `payload.payment.entity.notes.merchant_id` or `metadata.merchant_id`
 * 5. Account ID DB mapping: `body.account_id` -> `merchants.razorpay_merchant_id`
 * 6. Default connected store fallback: `'m_ecommerce_01'`
 */
async function resolveWebhookMerchantId(request: FastifyRequest, body: any, paymentEntity: any): Promise<string> {
  const paramMerchant = (request.params as any)?.merchantId || (request.params as any)?.merchant_id;
  if (paramMerchant && typeof paramMerchant === 'string' && paramMerchant.trim() !== '') {
    return paramMerchant.trim();
  }

  const queryMerchant = (request.query as any)?.merchant_id || (request.query as any)?.merchantId;
  if (queryMerchant && typeof queryMerchant === 'string' && queryMerchant.trim() !== '') {
    return queryMerchant.trim();
  }

  const headerMerchant = (request.headers['x-merchant-id'] as string) || (request.headers['x-safero-merchant-id'] as string);
  if (headerMerchant && typeof headerMerchant === 'string' && headerMerchant.trim() !== '') {
    return headerMerchant.trim();
  }

  const notesMerchant = paymentEntity?.notes?.merchant_id || paymentEntity?.notes?.merchantId || paymentEntity?.notes?.userId || paymentEntity?.metadata?.merchant_id || body?.metadata?.merchant_id;
  if (notesMerchant && typeof notesMerchant === 'string' && notesMerchant.trim() !== '') {
    return notesMerchant.trim();
  }

  const accountId = body?.account_id || paymentEntity?.account_id || body?.account;
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

/**
 * Unified ML scoring and transaction persistence pipeline for all webhook providers.
 */
async function processWebhookTransaction(opts: {
  gateway: 'razorpay' | 'stripe' | 'cashfree' | 'custom';
  paymentId: string;
  merchantId: string;
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

    let signatureVerified = false;

    if (secret) {
      if (!signature) {
        logger.warn('⚠️ Razorpay Webhook missing X-Razorpay-Signature header');
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
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'HMAC signature verification failed' },
        });
      }
    } else {
      signatureVerified = false;
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

    return processWebhookTransaction({
      gateway: 'razorpay',
      paymentId,
      merchantId,
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

    let signatureVerified = false;

    if (secret) {
      if (!sigHeader) {
        logger.warn('⚠️ Stripe Webhook missing Stripe-Signature header');
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
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Stripe signature header format invalid' },
        });
      }

      const timestamp = parseInt(timestampStr, 10);
      const now = Math.floor(Date.now() / 1000);
      if (isNaN(timestamp) || Math.abs(now - timestamp) > 300) {
        logger.warn({ timestamp, now }, '⚠️ Stripe Webhook timestamp outside 5-minute tolerance window');
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
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Stripe signature verification failed' },
        });
      }
    } else {
      signatureVerified = false;
    }

    const body = (request.body as any) || {};
    const event = body.type || 'payment_intent.succeeded';
    const obj = body.data?.object || body;

    const paymentId = obj.id || `pi_${crypto.randomUUID().slice(0, 10)}`;
    const merchantId = await resolveWebhookMerchantId(request, body, obj);
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

    return processWebhookTransaction({
      gateway: 'stripe',
      paymentId,
      merchantId,
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

    let signatureVerified = false;

    if (secret) {
      if (!signature) {
        logger.warn('⚠️ Cashfree Webhook missing x-webhook-signature header');
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
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Cashfree signature verification failed' },
        });
      }
    } else {
      signatureVerified = false;
    }

    const body = (request.body as any) || {};
    const event = body.type || body.event || 'PAYMENT_SUCCESS_WEBHOOK';
    const payment = body.data?.payment || body.data?.order || body.data || body;
    const customer = body.data?.customer_details || body.customer_details || {};

    const paymentId = payment.cf_payment_id ? `cf_${payment.cf_payment_id}` : (payment.payment_id || `cf_${crypto.randomUUID().slice(0, 10)}`);
    const merchantId = await resolveWebhookMerchantId(request, body, payment);
    const amountInr = Number(payment.payment_amount || payment.order_amount || 1999);
    const currency = (payment.payment_currency || payment.order_currency || 'INR').toUpperCase();
    const method = (payment.payment_group || payment.payment_mode || 'upi').toLowerCase();
    const rawEmail = customer.customer_email || 'customer@cashfree.com';
    const rawPhone = customer.customer_phone || '';
    const rawPaymentId = payment.payment_method || `pm_cf_${crypto.randomUUID().slice(0, 8)}`;
    const deviceId = customer.device_id || body.device_id || `dev_cf_${crypto.randomUUID().slice(0, 8)}`;
    const ipAddress = body.ip_address || request.ip || '0.0.0.0';
    const customerId = customer.customer_id || `cust_cf_${crypto.randomUUID().slice(0, 8)}`;

    return processWebhookTransaction({
      gateway: 'cashfree',
      paymentId,
      merchantId,
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
    const merchantId = await resolveWebhookMerchantId(request, body, body);
    const customSecret = process.env.CUSTOM_WEBHOOK_SECRET || '';

    let signatureVerified = false;

    if (customSecret) {
      if (!signature) {
        logger.warn({ merchantId }, '⚠️ Custom Webhook missing signature header when secret is configured');
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
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Custom webhook signature verification failed' },
        });
      }
    } else {
      signatureVerified = false;
      logger.info({ merchantId }, 'Custom webhook ingested unverified — no secret configured');
    }

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

    return processWebhookTransaction({
      gateway: 'custom',
      paymentId,
      merchantId,
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
      reply,
    });
  };

  app.post('/webhooks/custom', handleCustomWebhook);
  app.post('/webhooks/custom/:merchantId', handleCustomWebhook);

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
