import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createMerchantSchema, paginationSchema, uuidParamSchema } from '@safero/shared';
import { pool } from '../database.js';
import { errors } from '../errors.js';
import { authenticate, getAuthContext } from './auth.js';

export async function merchantRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // Get current merchant profile & gateway settings
  app.get('/merchants/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const authCtx = getAuthContext(request);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authCtx.merchantId);

    if (isUuid) {
      const res = await pool.query('SELECT * FROM merchants WHERE id = $1', [authCtx.merchantId]);
      if (res.rows.length > 0) {
        return reply.send({ success: true, data: res.rows[0] });
      }
    }

    reply.send({
      success: true,
      data: {
        id: authCtx.merchantId,
        name: authCtx.userEmail,
        razorpay_merchant_id: null,
      },
    });
  });

  // Link or update Gateway (Razorpay/Stripe/Cashfree) Account ID
  app.put('/merchants/me/gateway-account', async (request: FastifyRequest, reply: FastifyReply) => {
    const authCtx = getAuthContext(request);
    const { razorpay_merchant_id } = (request.body as any) || {};

    if (!razorpay_merchant_id || typeof razorpay_merchant_id !== 'string') {
      throw errors.badRequest('razorpay_merchant_id is required');
    }

    const cleanAccountId = razorpay_merchant_id.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authCtx.merchantId);

    if (isUuid) {
      const existing = await pool.query('SELECT id FROM merchants WHERE id = $1', [authCtx.merchantId]);
      if (existing.rows.length > 0) {
        const updated = await pool.query(
          'UPDATE merchants SET razorpay_merchant_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
          [cleanAccountId, authCtx.merchantId],
        );
        return reply.send({ success: true, data: updated.rows[0] });
      } else {
        const created = await pool.query(
          `INSERT INTO merchants (id, name, razorpay_merchant_id, business_type, category)
           VALUES ($1, $2, $3, 'ecommerce', 'retail')
           RETURNING *`,
          [authCtx.merchantId, authCtx.userEmail, cleanAccountId],
        );
        return reply.send({ success: true, data: created.rows[0] });
      }
    }

    reply.send({
      success: true,
      data: {
        id: authCtx.merchantId,
        razorpay_merchant_id: cleanAccountId,
      },
    });
  });

  // List merchants
  app.get('/merchants', async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, page_size } = paginationSchema.parse(request.query);
    const offset = (page - 1) * page_size;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        'SELECT * FROM merchants ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [page_size, offset],
      ),
      pool.query('SELECT COUNT(*) FROM merchants'),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    reply.send({
      success: true,
      data: dataResult.rows,
      meta: { page, page_size, total, total_pages: Math.ceil(total / page_size) },
    });
  });

  // Get merchant by ID
  app.get('/merchants/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = uuidParamSchema.parse(request.params);

    const result = await pool.query('SELECT * FROM merchants WHERE id = $1', [id]);
    if (result.rows.length === 0) throw errors.notFound('Merchant');

    reply.send({ success: true, data: result.rows[0] });
  });

  // Create merchant
  app.post('/merchants', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createMerchantSchema.parse(request.body);

    const result = await pool.query(
      `INSERT INTO merchants (name, razorpay_merchant_id, business_type, category, website)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [body.name, body.razorpay_merchant_id, body.business_type, body.category, body.website],
    );

    reply.status(201).send({ success: true, data: result.rows[0] });
  });
}
