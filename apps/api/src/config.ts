import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

export const config = {
  env: process.env['NODE_ENV'] || 'development',
  port: parseInt(process.env['PORT'] || '3001', 10),
  logLevel: process.env['LOG_LEVEL'] || 'info',

  database: {
    url: process.env['DATABASE_URL'] || 'postgresql://safero:safero_dev@localhost:5432/safero',
  },

  supabase: {
    url: process.env['SUPABASE_URL'] || '',
    anonKey: process.env['SUPABASE_ANON_KEY'] || '',
    serviceRoleKey: process.env['SUPABASE_SERVICE_ROLE_KEY'] || '',
  },

  jwt: {
    secret: process.env['JWT_SECRET'] || 'dev-secret-change-in-production',
    accessTokenExpiry: process.env['JWT_ACCESS_TOKEN_EXPIRY'] || '15m',
    refreshTokenExpiry: process.env['JWT_REFRESH_TOKEN_EXPIRY'] || '7d',
  },

  razorpay: {
    keyId: process.env['RAZORPAY_KEY_ID'] || '',
    keySecret: process.env['RAZORPAY_KEY_SECRET'] || '',
    webhookSecret: process.env['RAZORPAY_WEBHOOK_SECRET'] || '',
  },

  stripe: {
    webhookSecret: process.env['STRIPE_WEBHOOK_SECRET'] || '',
  },

  cashfree: {
    webhookSecret: process.env['CASHFREE_WEBHOOK_SECRET'] || '',
  },

  mlService: {
    url: process.env['ML_SERVICE_URL'] || 'http://localhost:8000',
  },

  groq: {
    apiKey: process.env['GROQ_API_KEY'] || '',
    model: process.env['GROQ_MODEL'] || 'openai/gpt-oss-120b',
  },

  cors: {
    origin: process.env['CORS_ORIGIN'] || 'http://localhost:5173',
  },
} as const;
