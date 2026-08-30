import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createMerchantSchema, paginationSchema, uuidParamSchema } from '@safero/shared';
import { pool } from '../database.js';
import { errors } from '../errors.js';
import { authenticate } from './auth.js';

export async function merchantRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

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
