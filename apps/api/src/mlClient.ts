/**
 * Shared HTTP client for calling the SafeRo ML Scoring Service.
 *
 * Design notes:
 *  - Timeout: 5 000 ms ceiling. In practice the service responds in ~50-150 ms
 *    (logistic regression on localhost). The ceiling guards against a hung process.
 *  - No silent fallback: if the ML service is unreachable, MlServiceError is thrown
 *    and the caller must return a 503. A fake score is worse than an honest error.
 *  - Single function: callMlScore() — all routes use the same HTTP pattern.
 */

import { config } from './config.js';
import { logger } from './logger.js';

export class MlServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 503,
  ) {
    super(message);
    this.name = 'MlServiceError';
  }
}

const ML_TIMEOUT_MS = 5_000;

export async function callMlScore<T = any>(
  endpoint: '/score/transaction' | '/score/ring' | '/recluster',
  payload: Record<string, unknown>,
  timeoutMs: number = ML_TIMEOUT_MS,
): Promise<T> {
  const url = `${config.mlService.url}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const t0 = performance.now();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const latencyMs = Math.round(performance.now() - t0);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error({ endpoint, status: res.status, body, latencyMs }, 'ML service returned error');
      throw new MlServiceError(
        `ML service returned ${res.status}: ${body}`,
        res.status >= 500 ? 503 : res.status,
      );
    }

    const data = await res.json() as T;
    logger.info({ endpoint, latencyMs }, 'ML service scored successfully');
    return data;
  } catch (err: any) {
    clearTimeout(timer);
    const latencyMs = Math.round(performance.now() - t0);

    if (err.name === 'AbortError') {
      logger.error({ endpoint, latencyMs }, `ML service timed out after ${ML_TIMEOUT_MS}ms`);
      throw new MlServiceError(`ML service timed out after ${ML_TIMEOUT_MS}ms`, 503);
    }

    if (err instanceof MlServiceError) throw err;

    logger.error({ endpoint, err: err.message, latencyMs }, 'ML service unreachable');
    throw new MlServiceError(`ML service unreachable: ${err.message}`, 503);
  }
}
