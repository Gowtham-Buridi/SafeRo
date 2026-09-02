import { execSync } from 'child_process';
import type { FastifyInstance } from 'fastify';
import { checkDatabaseConnection } from '../database.js';
import { config } from '../config.js';

let cachedGitCommit =
  process.env['RENDER_GIT_COMMIT'] ||
  process.env['VERCEL_GIT_COMMIT_SHA'] ||
  process.env['GIT_COMMIT'] ||
  '';

if (!cachedGitCommit) {
  try {
    cachedGitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8', timeout: 1000 }).trim();
  } catch {
    cachedGitCommit = '0b1baa7';
  }
}

const deployTimestamp =
  process.env['RENDER_DEPLOY_TIMESTAMP'] ||
  process.env['BUILD_TIMESTAMP'] ||
  process.env['DEPLOYED_AT'] ||
  new Date().toISOString();

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const getSystemMetadata = () => ({
    status: 'ok',
    service: 'safero-api',
    version: '0.1.0',
    environment: config.env,
    git_commit: cachedGitCommit,
    git_commit_short: cachedGitCommit.slice(0, 7),
    deployed_at: deployTimestamp,
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });

  app.get('/health', async (_request, reply) => {
    reply.send(getSystemMetadata());
  });

  app.get('/system/info', async (_request, reply) => {
    reply.send({
      success: true,
      data: getSystemMetadata(),
    });
  });

  app.get('/health/ready', async (_request, reply) => {
    const dbHealthy = await checkDatabaseConnection();

    const status = dbHealthy ? 'ready' : 'degraded';
    const statusCode = dbHealthy ? 200 : 503;

    reply.status(statusCode).send({
      status,
      timestamp: new Date().toISOString(),
      git_commit_short: cachedGitCommit.slice(0, 7),
      checks: {
        database: dbHealthy ? 'connected' : 'disconnected',
      },
    });
  });
}
