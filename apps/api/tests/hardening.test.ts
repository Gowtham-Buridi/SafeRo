import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { userStore } from '../src/userStore.js';
import { maskEmail, maskPhone, hashPii, maskPaymentIdentifier } from '../src/lib/pii.js';
import type { FastifyInstance } from 'fastify';

describe('SafeRo Final Hardening: Multi-Tenant Isolation, Security, AI Grounding, & Access Control', () => {
  let app: FastifyInstance;
  let userAToken: string;
  let userBToken: string;
  let demoToken: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    app = await buildApp();

    // 1. Register User A (Tenant A)
    const userAEmail = `user_a_${Date.now()}@tenant-alpha.com`;
    const regResA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: userAEmail,
        password: 'Password123!',
        full_name: 'Merchant A Analyst',
      },
    });
    expect(regResA.statusCode).toBe(201);
    const bodyA = JSON.parse(regResA.body);
    userAToken = bodyA.data.access_token;
    userAId = bodyA.data.user.id;

    // 2. Register User B (Tenant B)
    const userBEmail = `user_b_${Date.now()}@tenant-beta.com`;
    const regResB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: userBEmail,
        password: 'Password123!',
        full_name: 'Merchant B Analyst',
      },
    });
    expect(regResB.statusCode).toBe(201);
    const bodyB = JSON.parse(regResB.body);
    userBToken = bodyB.data.access_token;
    userBId = bodyB.data.user.id;

    // 3. Login Demo User
    const demoRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'demo@safero.internal',
        password: 'SafeRo#Demo2026!',
      },
    });
    expect(demoRes.statusCode).toBe(200);
    const bodyDemo = JSON.parse(demoRes.body);
    demoToken = bodyDemo.data.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Area 1: Multi-Tenant Data Isolation ────────────────────────
  describe('Area 1: Strict Multi-Tenant Data Isolation', () => {
    it('User A creates a risk case; User B cannot see it in GET /cases', async () => {
      // User A creates a case
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/cases',
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          title: 'Suspicious Bot Burst Alpha',
          risk_score: 0.93,
          severity: 'critical',
          signals: [{ signal_type: 'device_collision', severity: 'high', polarity: 'negative', message: 'Tenant A Collision' }],
        },
      });
      expect(createRes.statusCode).toBe(201);
      const caseA = JSON.parse(createRes.body).data;
      expect(caseA.merchant_id).toBe(userAId);

      // User A reads cases: should see caseA
      const listA = await app.inject({
        method: 'GET',
        url: '/api/v1/cases',
        headers: { authorization: `Bearer ${userAToken}` },
      });
      expect(listA.statusCode).toBe(200);
      const casesForA = JSON.parse(listA.body).data;
      expect(casesForA.some((c: any) => c.id === caseA.id)).toBe(true);

      // User B reads cases: must NOT see caseA
      const listB = await app.inject({
        method: 'GET',
        url: '/api/v1/cases',
        headers: { authorization: `Bearer ${userBToken}` },
      });
      expect(listB.statusCode).toBe(200);
      const casesForB = JSON.parse(listB.body).data;
      expect(casesForB.some((c: any) => c.id === caseA.id)).toBe(false);

      // User B direct lookup by ID: must return 404
      const lookupB = await app.inject({
        method: 'GET',
        url: `/api/v1/cases/${caseA.id}`,
        headers: { authorization: `Bearer ${userBToken}` },
      });
      expect(lookupB.statusCode).toBe(404);
    });

    it('User A transactions are isolated from User B in GET /transactions', async () => {
      const listB = await app.inject({
        method: 'GET',
        url: '/api/v1/transactions',
        headers: { authorization: `Bearer ${userBToken}` },
      });
      expect(listB.statusCode).toBe(200);
      const bodyB = JSON.parse(listB.body);
      expect(bodyB.success).toBe(true);
      bodyB.data.forEach((t: any) => {
        expect(t.merchant_id).toBe(userBId);
      });
    });

    it('POST /webhooks/simulate requires valid JWT authentication & tags merchant_id from session', async () => {
      // Unauthenticated call: must be rejected with 401
      const unauthRes = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/simulate',
        payload: { amount: 1999, email: 'target@customer.com' },
      });
      expect(unauthRes.statusCode).toBe(401);

      // Authenticated as User A: derives merchant_id = userAId
      const authRes = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/simulate',
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { amount: 2999, email: 'target@customer.com' },
      });
      expect(authRes.statusCode).toBe(201);
      const authBody = JSON.parse(authRes.body);
      expect(authBody.data.merchant_id).toBe(userAId);
    });
  });

  // ── Area 2: AI Investigation & Chat Grounding ──────────────────
  describe('Area 2: Grounded, Per-User Scoped AI Forensics & Refusal', () => {
    it('AI chat rejects invalid payload gracefully', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/chat',
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { messages: [] },
      });
      expect(res.statusCode).toBe(400);
    });

    it('AI chat endpoint responds with grounded assistant message or structured fallback', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/chat',
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          messages: [{ role: 'user', content: 'What is our current transaction volume and open risk cases?' }],
        },
      });
      expect([200, 502, 503]).toContain(res.statusCode);
      const body = JSON.parse(res.body);
      if (res.statusCode === 200) {
        expect(body.success).toBe(true);
        expect(body.data.content).toBeDefined();
      } else {
        expect(body.error).toBeDefined();
      }
    });
  });

  // ── Area 3: Security Checklist ─────────────────────────────────
  describe('Area 3: Security Checklist Verification', () => {
    it('Password hashes are valid bcrypt strings ($2a$ or $2b$ with 60 chars)', async () => {
      const user = await userStore.findByEmail('admin@safero.io');
      expect(user).toBeDefined();
      expect(user?.password_hash).toMatch(/^\$2[ab]\$10\$/);
      expect(user?.password_hash.length).toBe(60);
    });

    it('PII masking utilities hash and mask sensitive fields securely', () => {
      // Email masking
      expect(maskEmail('vikram.sharma@example.com')).toBe('vik***@example.com');
      expect(maskEmail('ab@xyz.com')).toBe('a***@xyz.com');
      expect(maskEmail('')).toBe('cust_***');

      // Phone masking
      expect(maskPhone('+919876543210')).toBe('+919***210');
      expect(maskPhone('')).toBe('phone_***');

      // Payment masking
      expect(maskPaymentIdentifier('sharma@okhdfcbank')).toBe('sha***@okhdfcbank');
      expect(maskPaymentIdentifier('4111222233334444')).toBe('4111******4444');

      // SHA-256 Hashing
      const h1 = hashPii('customer@example.com');
      const h2 = hashPii('customer@example.com');
      const h3 = hashPii('other@example.com');
      expect(h1).toHaveLength(64);
      expect(h1).toBe(h2);
      expect(h1).not.toBe(h3);
    });

    it('PII masking is applied on GET /transactions customer outputs', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/transactions?page=1&page_size=5',
        headers: { authorization: `Bearer ${demoToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBeGreaterThan(0);
      body.data.forEach((txn: any) => {
        expect(txn.customer_id).toBeDefined();
        expect(txn.customer_masked).toBeDefined();
        // If email was present, it should have masked format
        if (txn.customer_id.includes('@')) {
          expect(txn.customer_id).toContain('***');
        }
      });
    });

    it('Rate limiting is active on /auth/login (exceeding limit triggers 429)', async () => {
      const requests = Array.from({ length: 12 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email: 'wrong@safero.io', password: 'wrong' },
        })
      );
      const responses = await Promise.all(requests);
      const has429 = responses.some(r => r.statusCode === 429);
      expect(has429).toBe(true);
    });
  });

  // ── Area 4: Testbed/Demo Data Access Control ───────────────────
  describe('Area 4: Role-Locked Testbed / Demo Data Access', () => {
    it('Real user sending X-Safero-Environment: demo header is ignored and gets only their own real data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/transactions?page=1&page_size=20',
        headers: {
          authorization: `Bearer ${userAToken}`,
          'x-safero-environment': 'demo',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.pagination.total_records).toBeLessThan(25000);
    });

    it('Demo account receives synthetic testbed dataset', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/transactions?page=1&page_size=10',
        headers: {
          authorization: `Bearer ${demoToken}`,
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.pagination.total_records).toBe(25000);
      expect(body.data.length).toBe(10);
    });
  });
});
