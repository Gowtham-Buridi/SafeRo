import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { logger } from './logger.js';
import { errorHandler } from './errors.js';

// Route imports
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { merchantRoutes } from './routes/merchants.js';
import { customerRoutes } from './routes/customers.js';
import { transactionRoutes } from './routes/transactions.js';
import { riskRoutes } from './routes/risk.js';
import { caseRoutes } from './routes/cases.js';
import { graphRoutes } from './routes/graph.js';
import { analyticsRoutes } from './routes/analytics.js';
import { investigationRoutes } from './routes/investigations.js';
import { webhookRoutes } from './routes/webhooks.js';
import { aiRoutes } from './routes/ai.js';

export async function buildApp() {
  const app = Fastify({
    logger: false, // We use our own pino instance
  });

  // ─── Security Middleware ────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false, // Disable for REST API
  });

  // Strict CORS: allow localhost origins in dev, restricted origin in production
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://localhost:3001'];

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server webhooks)
      if (!origin) return cb(null, true);
      if (config.env === 'development' || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error('CORS policy: origin not allowed'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Safero-Environment', 'x-safero-environment', 'X-Razorpay-Signature', 'x-razorpay-signature'],
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // ─── Error Handler ──────────────────────────────────────────
  app.setErrorHandler(errorHandler);

  // ─── Content Type Parsers ────────────────────────────────────
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || (typeof body === 'string' && body.trim() === '')) {
      done(null, {});
      return;
    }
    try {
      const json = JSON.parse(body as string);
      done(null, json);
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // ─── Request Logging ────────────────────────────────────────
  app.addHook('onRequest', async (request) => {
    logger.info({ req: request }, 'incoming request');
  });

  app.addHook('onResponse', async (request, reply) => {
    logger.info(
      { res: reply, responseTime: reply.elapsedTime },
      'request completed',
    );
  });

  // ─── Global Routes ──────────────────────────────────────────
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(webhookRoutes);

  // ─── API V1 Routes ──────────────────────────────────────────
  await app.register(async function apiV1(api) {
    await api.register(authRoutes);
    await api.register(merchantRoutes);
    await api.register(customerRoutes);
    await api.register(transactionRoutes, { prefix: '/transactions' });
    await api.register(riskRoutes);
    await api.register(caseRoutes, { prefix: '/cases' });
    await api.register(graphRoutes, { prefix: '/graph' });
    await api.register(analyticsRoutes, { prefix: '/analytics' });
    await api.register(investigationRoutes, { prefix: '/investigations' });
    await api.register(webhookRoutes);
    await api.register(aiRoutes, { prefix: '/ai' });
  }, { prefix: '/api/v1' });

  return app;
}
