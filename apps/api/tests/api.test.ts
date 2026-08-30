import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Health Endpoints', () => {
  it('GET /health returns 200 with status ok', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('safero-api');
    expect(body.version).toBe('0.1.0');
    expect(body.timestamp).toBeDefined();

    await app.close();
  });

  it('GET /health/ready returns status check', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    // Will be 503 without database, but should still return valid JSON
    const body = JSON.parse(response.body);
    expect(body.status).toBeDefined();
    expect(body.checks).toBeDefined();
    expect(body.checks.database).toBeDefined();

    await app.close();
  });
});

describe('Error Handling', () => {
  it('returns 404 for unknown routes', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/nonexistent',
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });
});

describe('Auth Routes', () => {
  it('POST /auth/login validates request body', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'not-an-email', password: '123' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');

    await app.close();
  });
});
