import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

// Mock ML scoring service so self-test and webhooks complete predictably
vi.mock('../src/mlClient.js', () => ({
  callMlScore: vi.fn().mockResolvedValue({
    probability: 0.04,
    risk_level: 'low',
    action: 'ALLOW',
    model_version: 'v1.0.0-realtime',
    contributing_signals: [{ signal_type: 'normal_behavior', severity: 'low', message: 'Legitimate transaction pattern', weight: 0.1, polarity: 'negative' }],
    latency_breakdown_ms: { total_ms: 10 },
  }),
  MlServiceError: class MlServiceError extends Error {
    constructor(msg: string, public statusCode = 503) {
      super(msg);
      this.name = 'MlServiceError';
    }
  },
}));

describe('Webhook Self-Service Diagnostics & Self-Test Suite', () => {
  let app: FastifyInstance;
  let authHeaders: { authorization: string };
  const userMerchantId = 'm_demo_testbed';
  const rzpSecret = 'rzpsec_diag_test_secret_777';

  beforeAll(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = rzpSecret;
    app = await buildApp();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'demo@safero.internal',
        password: 'SafeRo#Demo2026!',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const token = JSON.parse(loginRes.body).data.access_token;
    authHeaders = { authorization: `Bearer ${token}` };
  }, 15000);

  afterAll(async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    await app.close();
  });

  it('1. Deliberate signature mismatch is logged in diagnostics with "Signature Failed" reason', async () => {
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_bad_sig_999', amount: 250000, currency: 'INR' } } },
    });

    const badSigRes = await app.inject({
      method: 'POST',
      url: `/webhooks/razorpay/${userMerchantId}`,
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': '0000000000000000000000000000000000000000000000000000000000000000',
      },
      payload,
    });

    expect(badSigRes.statusCode).toBe(401);
    const badBody = JSON.parse(badSigRes.body);
    expect(badBody.error.code).toBe('INVALID_SIGNATURE');

    // Query diagnostics endpoint to confirm failure is visible to the merchant
    const diagRes = await app.inject({
      method: 'GET',
      url: '/api/v1/webhooks/diagnostics',
      headers: authHeaders,
    });

    expect(diagRes.statusCode).toBe(200);
    const diagData = JSON.parse(diagRes.body).data;
    expect(diagData.recent_deliveries).toBeDefined();

    const failedEntry = diagData.recent_deliveries.find(
      (d: any) => d.payment_id === 'pay_bad_sig_999',
    );
    expect(failedEntry).toBeDefined();
    expect(failedEntry.outcome).toBe('rejected_signature');
    expect(failedEntry.signature_verified).toBe(false);
    expect(failedEntry.reason).toContain('HMAC signature verification failed');
    expect(failedEntry.status_code).toBe(401);
  }, 15000);

  it('2. "Send Test Webhook" executes real signed production path and appears in diagnostics', async () => {
    const testRes = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/self-test',
      headers: authHeaders,
      payload: { gateway: 'razorpay' },
    });

    expect(testRes.statusCode).toBe(200);
    const testData = JSON.parse(testRes.body).data;
    expect(testData.status_code).toBe(200);
    expect(testData.signature_verified).toBe(true);
    expect(testData.transaction_id).toMatch(/^pay_selftest_/);
    expect(testData.resolved_merchant_id).toBe(userMerchantId);

    // Confirm it appears in diagnostics feed as 'processed'
    const diagRes = await app.inject({
      method: 'GET',
      url: '/api/v1/webhooks/diagnostics',
      headers: authHeaders,
    });

    expect(diagRes.statusCode).toBe(200);
    const diagData = JSON.parse(diagRes.body).data;
    const processedEntry = diagData.recent_deliveries.find(
      (d: any) => d.payment_id === testData.transaction_id,
    );
    expect(processedEntry).toBeDefined();
    expect(processedEntry.outcome).toBe('processed');
    expect(processedEntry.signature_verified).toBe(true);
    expect(processedEntry.status_code).toBe(200);
    expect(processedEntry.reason).toContain('Payment captured & scored');
  }, 15000);

  it('3. Exposes deployed version/build metadata in /health and /system/info', async () => {
    const healthRes = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(healthRes.statusCode).toBe(200);
    const health = JSON.parse(healthRes.body);
    expect(health.git_commit).toBeDefined();
    expect(health.git_commit_short).toBeDefined();
    expect(health.deployed_at).toBeDefined();
    expect(health.version).toBe('0.1.0');

    const systemInfoRes = await app.inject({
      method: 'GET',
      url: '/system/info',
    });
    expect(systemInfoRes.statusCode).toBe(200);
    const systemInfo = JSON.parse(systemInfoRes.body).data;
    expect(systemInfo.git_commit_short).toBe(health.git_commit_short);
  });
});
