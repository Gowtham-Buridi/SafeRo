import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { paginationSchema, uuidParamSchema } from '@safero/shared';
import { pool } from '../database.js';
import { errors } from '../errors.js';
import { authenticate } from './auth.js';

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // List customers
  app.get('/customers', async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, page_size } = paginationSchema.parse(request.query);
    const offset = (page - 1) * page_size;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        'SELECT * FROM customers ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [page_size, offset],
      ),
      pool.query('SELECT COUNT(*) FROM customers'),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    reply.send({
      success: true,
      data: dataResult.rows,
      meta: { page, page_size, total, total_pages: Math.ceil(total / page_size) },
    });
  });

  // Get customer by ID
  app.get('/customers/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = uuidParamSchema.parse(request.params);

    const result = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
    if (result.rows.length === 0) throw errors.notFound('Customer');

    reply.send({ success: true, data: result.rows[0] });
  });
}
