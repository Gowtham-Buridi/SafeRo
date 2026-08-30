import pg from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

const { Pool } = pg;

const isCloudOrProd =
  config.env === 'production' ||
  config.database.url.includes('supabase.co') ||
  config.database.url.includes('supabase.com') ||
  config.database.url.includes('sslmode=require') ||
  config.database.url.includes('amazonaws.com') ||
  config.database.url.includes('azure.com');

export const pool = new Pool({
  connectionString: config.database.url,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ...(isCloudOrProd && {
    ssl: { rejectUnauthorized: false },
  }),
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (err) {
    logger.warn({ err }, 'Database connection check failed');
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
