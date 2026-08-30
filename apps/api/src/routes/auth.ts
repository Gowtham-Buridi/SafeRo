import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loginSchema, registerSchema } from '@safero/shared';
import { userStore, type UserRecord } from '../userStore.js';
import { config } from '../config.js';
import { errors, AppError } from '../errors.js';
import { logger } from '../logger.js';

export interface AuthContext {
  userId: string;
  userEmail: string;
  userRole: string;
  merchantId: string;
  isDemo: boolean;
}

function parseExpiryToSeconds(expiryStr: string | number): number {
  if (typeof expiryStr === 'number') return expiryStr;
  const match = expiryStr.match(/^(\d+)([smhd])$/);
  if (!match) return 900; // 15m default
  const val = parseInt(match[1] || '900', 10);
  const unit = match[2];
  if (unit === 's') return val;
  if (unit === 'm') return val * 60;
  if (unit === 'h') return val * 3600;
  if (unit === 'd') return val * 86400;
  return 900;
}

function generateTokens(user: UserRecord) {
  const accessExpirySec = parseExpiryToSeconds(config.jwt.accessTokenExpiry || '15m');
  const refreshExpirySec = parseExpiryToSeconds(config.jwt.refreshTokenExpiry || '7d');

  const accessToken = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      merchant_id: user.merchant_id,
      is_demo: user.is_demo,
    },
    config.jwt.secret,
    { expiresIn: accessExpirySec },
  );

  const refreshToken = jwt.sign(
    { sub: user.id, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: refreshExpirySec },
  );

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: accessExpirySec,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const authRateLimitConfig = {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
        errorResponseBuilder: () => ({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded: max 10 authentication attempts per minute. Please try again later.',
        }),
      },
    },
  };

  // ── Register ───────────────────────────────────────────────
  const handleRegister = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = registerSchema.parse(request.body);

    const existing = await userStore.findByEmail(body.email);
    if (existing) {
      throw errors.conflict('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await userStore.createUser({
      email: body.email,
      passwordHash,
      fullName: body.full_name,
      role: 'analyst',
    });

    const tokens = generateTokens(user);
    logger.info({ userId: user.id, email: user.email, merchantId: user.merchant_id }, 'User registered successfully');

    reply.status(201).send({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          merchant_id: user.merchant_id,
          is_demo: user.is_demo,
        },
        ...tokens,
      },
    });
  };

  app.post('/auth/register', authRateLimitConfig, handleRegister);
  app.post('/register', authRateLimitConfig, handleRegister);

  // ── Login ──────────────────────────────────────────────────
  const handleLogin = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(request.body);

    const user = await userStore.findByEmail(body.email);
    if (!user) {
      throw errors.unauthorized('Invalid email or password');
    }

    if (!user.is_active) {
      throw errors.forbidden('Account is deactivated');
    }

    const validPassword = await bcrypt.compare(body.password, user.password_hash);
    if (!validPassword) {
      throw errors.unauthorized('Invalid email or password');
    }

    await userStore.updateLastLogin(user.id);
    const tokens = generateTokens(user);

    logger.info({ userId: user.id, email: user.email, merchantId: user.merchant_id }, 'User logged in successfully');

    reply.send({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          merchant_id: user.merchant_id,
          is_demo: user.is_demo,
        },
        ...tokens,
      },
    });
  };

  app.post('/auth/login', authRateLimitConfig, handleLogin);
  app.post('/login', authRateLimitConfig, handleLogin);

  // ── Refresh Token ──────────────────────────────────────────
  const handleRefresh = async (request: FastifyRequest, reply: FastifyReply) => {
    const { refresh_token } = (request.body || {}) as { refresh_token?: string };

    if (!refresh_token) {
      throw errors.badRequest('Refresh token is required');
    }

    try {
      const payload = jwt.verify(refresh_token, config.jwt.secret) as { sub: string; type: string };

      if (payload.type !== 'refresh') {
        throw errors.unauthorized('Invalid token type');
      }

      const user = await userStore.findById(payload.sub);
      if (!user || !user.is_active) {
        throw errors.unauthorized('User not found or deactivated');
      }

      const tokens = generateTokens(user);
      reply.send({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            merchant_id: user.merchant_id,
            is_demo: user.is_demo,
          },
          ...tokens,
        },
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw errors.unauthorized('Invalid or expired refresh token');
    }
  };

  app.post('/auth/refresh', handleRefresh);
  app.post('/refresh', handleRefresh);

  // ── Current User Profile ───────────────────────────────────
  const handleMe = async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    const userId = (request as any).userId;
    const user = await userStore.findById(userId);
    if (!user) {
      throw errors.unauthorized('User not found');
    }

    reply.send({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        merchant_id: user.merchant_id,
        is_demo: user.is_demo,
        created_at: user.created_at,
        last_login_at: user.last_login_at,
      },
    });
  };

  app.get('/auth/me', handleMe);
  app.get('/me', handleMe);

  // ── Logout ─────────────────────────────────────────────────
  const handleLogout = async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.send({ success: true, data: { message: 'Logged out successfully' } });
  };

  app.post('/auth/logout', handleLogout);
  app.post('/logout', handleLogout);
}

// ── Auth middleware for protected routes ─────────────────────
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw errors.unauthorized('Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret) as {
      sub: string;
      email: string;
      role: string;
      merchant_id?: string;
      is_demo?: boolean;
    };

    const isDemo = payload.is_demo ?? payload.email.toLowerCase().includes('demo');
    const merchantId = payload.merchant_id || payload.sub;

    // Attach user info to request context
    (request as any).userId = payload.sub;
    (request as any).userEmail = payload.email;
    (request as any).userRole = payload.role;
    (request as any).merchantId = merchantId;
    (request as any).isDemo = isDemo;
  } catch {
    throw errors.unauthorized('Invalid or expired access token');
  }
}

/**
 * Gracefully extract AuthContext from request (if bearer token is present),
 * or resolve based on optional headers/fallback for public routes.
 */
export function getAuthContext(request: FastifyRequest): AuthContext {
  const reqAny = request as any;
  if (reqAny.userId && reqAny.merchantId) {
    return {
      userId: reqAny.userId,
      userEmail: reqAny.userEmail,
      userRole: reqAny.userRole || 'analyst',
      merchantId: reqAny.merchantId,
      isDemo: reqAny.isDemo ?? false,
    };
  }

  // Attempt to parse token if not already parsed
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const payload = jwt.verify(token, config.jwt.secret) as {
        sub: string;
        email: string;
        role: string;
        merchant_id?: string;
        is_demo?: boolean;
      };
      const isDemo = payload.is_demo ?? payload.email.toLowerCase().includes('demo');
      const merchantId = payload.merchant_id || payload.sub;
      return {
        userId: payload.sub,
        userEmail: payload.email,
        userRole: payload.role || 'analyst',
        merchantId,
        isDemo,
      };
    } catch {
      // Invalid/expired token
    }
  }

  // Fallback for unauthenticated/demo endpoints: check header or query
  const envHeader = (request.headers['x-safero-environment'] as string) || (request.query as any)?.env;
  const isDemo = envHeader === 'demo';
  return {
    userId: isDemo ? 'u_demo_001' : 'u_anonymous',
    userEmail: isDemo ? 'demo@safero.ai' : 'anonymous@safero.internal',
    userRole: 'analyst',
    merchantId: isDemo ? 'm_demo_testbed' : 'm_ecommerce_01',
    isDemo,
  };
}
