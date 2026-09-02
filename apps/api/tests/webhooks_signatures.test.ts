import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

// Mock ML scoring service so webhooks test signature verification logic deterministically
vi.mock('../src/mlClient.js', () => ({
  callMlScore: vi.fn().mockResolvedValue({
    probability: 0.05,
    risk_level: 'low',
    action: 'ALLOW',
    model_version: 'v1.0.0-realtime',
    contributing_signals: [],
    latency_breakdown_ms: { total_ms: 12 },
  }),
  MlServiceError: class MlServiceError extends Error {
    constructor(msg: string, public statusCode = 503) {
      super(msg);
      this.name = 'MlServiceError';
    }
  },
}));

describe('Webhook Signature Verification & Raw Body Suite', () => {
  let app: FastifyInstance;
  const stripeSecret = 'whsec_test_stripe_secret_12345';
  const cashfreeSecret = 'cfsec_test_cashfree_secret_67890';
  const razorpaySecret = 'rzpsec_test_razorpay_secret_99999';
  const customSecret = 'customsec_test_secret_11111';

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = stripeSecret;
    process.env.CASHFREE_WEBHOOK_SECRET = cashfreeSecret;
    process.env.RAZORPAY_WEBHOOK_SECRET = razorpaySecret;
    process.env.CUSTOM_WEBHOOK_SECRET = customSecret;
    app = await buildApp();
  });

  afterAll(async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.CASHFREE_WEBHOOK_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.CUSTOM_WEBHOOK_SECRET;
    await app.close();
  });

  // ── 1. STRIPE ─────────────────────────────────────────────────────────────
  describe('Stripe Signature Verification', () => {
    it('accepts correctly-signed Stripe webhook event with signatureVerified: true', async () => {
      const payloadObj = {
        id: 'pi_test_stripe_valid_001',
        type: 'payment_intent.succeeded',
        amount: 2500,
        currency: 'inr',
        customer: 'cust_stripe_001',
        payment_method_types: ['card'],
        status: 'succeeded',
      };
      const rawBody = JSON.stringify(payloadObj);
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${rawBody}`;
      const signature = crypto.createHmac('sha256', stripeSecret).update(signedPayload).digest('hex');
      const sigHeader = `t=${timestamp},v1=${signature}`;

      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/stripe/m_ecommerce_01',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': sigHeader,
        },
        payload: rawBody,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.transaction_id).toBe('pi_test_stripe_valid_001');

      // Check webhook audit feed to verify signatureVerified: true
      const historyRes = await app.inject({ method: 'GET', url: '/api/v1/webhooks/history' });
      const history = JSON.parse(historyRes.body).data;
      const entry = history.find((h: any) => h.payment_id === 'pi_test_stripe_valid_001');
      expect(entry).toBeDefined();
      expect(entry.signature_verified).toBe(true);
    });

    it('rejects Stripe webhook with invalid signature with 401', async () => {
      const payloadObj = { id: 'pi_test_stripe_bad_002', amount: 1000 };
      const rawBody = JSON.stringify(payloadObj);
      const timestamp = Math.floor(Date.now() / 1000);
      const sigHeader = `t=${timestamp},v1=bad_signature_hash_123456`;

      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/stripe/m_ecommerce_01',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': sigHeader,
        },
        payload: rawBody,
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_SIGNATURE');
    });

    it('rejects Stripe webhook with timestamp older than 5 minutes (replay attack)', async () => {
      const payloadObj = { id: 'pi_test_stripe_replay_003', amount: 1000 };
      const rawBody = JSON.stringify(payloadObj);
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const signedPayload = `${expiredTimestamp}.${rawBody}`;
      const signature = crypto.createHmac('sha256', stripeSecret).update(signedPayload).digest('hex');
      const sigHeader = `t=${expiredTimestamp},v1=${signature}`;

      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/stripe/m_ecommerce_01',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': sigHeader,
        },
        payload: rawBody,
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('EXPIRED_SIGNATURE');
    });
  });

  // ── 2. CASHFREE ───────────────────────────────────────────────────────────
  describe('Cashfree Signature Verification', () => {
    it('accepts correctly-signed Cashfree webhook event with signatureVerified: true', async () => {
      const payloadObj = {
        data: {
          payment: { cf_payment_id: '11223344', payment_amount: 1999, payment_status: 'SUCCESS', payment_group: 'upi' },
          customer_details: { customer_id: 'cust_cf_001', customer_email: 'cashfree@test.com' },
        },
      };
      const rawBody = JSON.stringify(payloadObj);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payloadToSign = `${timestamp}${rawBody}`;
      const signature = crypto.createHmac('sha256', cashfreeSecret).update(payloadToSign).digest('base64');

      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/cashfree/m_ecommerce_01',
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': signature,
          'x-webhook-timestamp': timestamp,
        },
        payload: rawBody,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.transaction_id).toBe('cf_11223344');

      const historyRes = await app.inject({ method: 'GET', url: '/api/v1/webhooks/history' });
      const history = JSON.parse(historyRes.body).data;
      const entry = history.find((h: any) => h.payment_id === 'cf_11223344');
      expect(entry).toBeDefined();
      expect(entry.signature_verified).toBe(true);
    });

    it('rejects Cashfree webhook with invalid signature with 401', async () => {
      const payloadObj = { data: { payment: { cf_payment_id: '99999', payment_amount: 500 } } };
      const rawBody = JSON.stringify(payloadObj);

      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/cashfree/m_ecommerce_01',
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': 'invalid_base64_signature==',
          'x-webhook-timestamp': Math.floor(Date.now() / 1000).toString(),
        },
        payload: rawBody,
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_SIGNATURE');
    });
  });

  // ── 3. RAZORPAY RAW BODY VERIFICATION ─────────────────────────────────────
  describe('Razorpay Signature Verification (Raw Body)', () => {
    it('accepts correctly-signed Razorpay webhook with true raw body', async () => {
      const payloadObj = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_rzp_raw_001',
              amount: 50000,
              currency: 'INR',
              method: 'upi',
              email: 'rzp_raw@test.com',
            },
          },
        },
      };
      const rawBody = JSON.stringify(payloadObj);
      const signature = crypto.createHmac('sha256', razorpaySecret).update(rawBody).digest('hex');

      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/razorpay/m_ecommerce_01',
        headers: {
          'content-type': 'application/json',
          'x-razorpay-signature': signature,
        },
        payload: rawBody,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.transaction_id).toBe('pay_rzp_raw_001');

      const historyRes = await app.inject({ method: 'GET', url: '/api/v1/webhooks/history' });
      const history = JSON.parse(historyRes.body).data;
      const entry = history.find((h: any) => h.payment_id === 'pay_rzp_raw_001');
      expect(entry).toBeDefined();
      expect(entry.signature_verified).toBe(true);
    });

    it('rejects Razorpay webhook with tampered body or bad signature with 401', async () => {
      const payloadObj = { event: 'payment.captured', payment: { id: 'pay_rzp_bad' } };
      const rawBody = JSON.stringify(payloadObj);

      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/razorpay/m_ecommerce_01',
        headers: {
          'content-type': 'application/json',
          'x-razorpay-signature': '0000000000000000000000000000000000000000000000000000000000000000',
        },
        payload: rawBody,
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_SIGNATURE');
    });
  });

  // ── 4. CUSTOM GATEWAY VERIFICATION ────────────────────────────────────────
  describe('Custom Gateway Verification', () => {
    it('accepts custom webhook with valid HMAC header when secret is configured', async () => {
      const payloadObj = { payment_id: 'custom_signed_001', amount: 1500, status: 'captured' };
      const rawBody = JSON.stringify(payloadObj);
      const signature = crypto.createHmac('sha256', customSecret).update(rawBody).digest('hex');

      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/custom/m_ecommerce_01',
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': signature,
        },
        payload: rawBody,
      });

      expect(res.statusCode).toBe(200);
      const historyRes = await app.inject({ method: 'GET', url: '/api/v1/webhooks/history' });
      const history = JSON.parse(historyRes.body).data;
      const entry = history.find((h: any) => h.payment_id === 'custom_signed_001');
      expect(entry).toBeDefined();
      expect(entry.signature_verified).toBe(true);
    });

    it('honestly marks custom webhook as signatureVerified: false when no secret configured', async () => {
      delete process.env.CUSTOM_WEBHOOK_SECRET;

      const payloadObj = { payment_id: 'custom_unverified_002', amount: 800, status: 'captured' };
      const rawBody = JSON.stringify(payloadObj);

      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/custom/m_ecommerce_01',
        headers: { 'content-type': 'application/json' },
        payload: rawBody,
      });

      expect(res.statusCode).toBe(200);

      const historyRes = await app.inject({ method: 'GET', url: '/api/v1/webhooks/history' });
      const history = JSON.parse(historyRes.body).data;
      const entry = history.find((h: any) => h.payment_id === 'custom_unverified_002');
      expect(entry).toBeDefined();
      expect(entry.signature_verified).toBe(false);
    });
  });
});
