import dns from 'node:dns';
import { buildApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { closePool } from './database.js';
import { seedRingCasesToDb } from './caseStore.js';

// Force Node to prioritize IPv4 over IPv6 for outbound fetches (prevents Windows IPv6 timeout)
dns.setDefaultResultOrder('ipv4first');

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`SafeRo API running on http://localhost:${config.port}`);
    logger.info(`Environment: ${config.env}`);
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    await app.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
