import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,
  transport: config.env === 'development'
    ? { target: 'pino/file', options: { destination: 1 } }
    : undefined,
  serializers: {
    // Redact sensitive fields from request logs
    req(req) {
      return {
        method: req.method,
        url: req.url,
        hostname: req.hostname,
        remoteAddress: req.ip,
      };
    },
    // Don't log full response bodies
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
  // Sensitive field redaction (prevents accidental logging of passwords, tokens, API keys, cards)
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'password_hash',
      '*.password_hash',
      'token',
      '*.token',
      'refreshToken',
      '*.refreshToken',
      'accessToken',
      '*.accessToken',
      'secret',
      '*.secret',
      'apiKey',
      '*.apiKey',
      'GROQ_API_KEY',
      'RAZORPAY_KEY_SECRET',
      'SUPABASE_SERVICE_ROLE_KEY',
      'card_number',
      '*.card_number',
      'cvv',
      '*.cvv',
    ],
    censor: '[REDACTED]',
  },
});
