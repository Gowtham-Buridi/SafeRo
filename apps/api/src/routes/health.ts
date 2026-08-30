import type { FastifyInstance } from 'fastify';
import { checkDatabaseConnection } from '../database.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'safero-api',
      version: '0.1.0',
    });
  });

  app.get('/health/ready', async (_request, reply) => {
    const dbHealthy = await checkDatabaseConnection();

    const status = dbHealthy ? 'ready' : 'degraded';
    const statusCode = dbHealthy ? 200 : 503;

    reply.status(statusCode).send({
      status,
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealthy ? 'connected' : 'disconnected',
      },
    });
  });
}
