import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { riskScoreFilterSchema, uuidParamSchema } from '@safero/shared';
import { pool } from '../database.js';
import { errors } from '../errors.js';
import { authenticate } from './auth.js';

export async function riskRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // List risk scores
  app.get('/risk/scores', async (request: FastifyRequest, reply: FastifyReply) => {
    const filters = riskScoreFilterSchema.parse(request.query);
    const { page, page_size } = filters;
    const offset = (page - 1) * page_size;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.entity_type) {
      conditions.push(`entity_type = $${paramIndex++}`);
      params.push(filters.entity_type);
    }
    if (filters.risk_level) {
      conditions.push(`risk_level = $${paramIndex++}`);
      params.push(filters.risk_level);
    }
    if (filters.min_score !== undefined) {
      conditions.push(`score >= $${paramIndex++}`);
      params.push(filters.min_score);
    }
    if (filters.max_score !== undefined) {
      conditions.push(`score <= $${paramIndex++}`);
      params.push(filters.max_score);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT * FROM risk_scores ${whereClause} ORDER BY scored_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        [...params, page_size, offset],
      ),
      pool.query(
        `SELECT COUNT(*) FROM risk_scores ${whereClause}`,
        params,
      ),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    reply.send({
      success: true,
      data: dataResult.rows,
      meta: { page, page_size, total, total_pages: Math.ceil(total / page_size) },
    });
  });

  // List risk signals for an entity
  app.get('/risk/signals/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = uuidParamSchema.parse(request.params);

    const result = await pool.query(
      'SELECT * FROM risk_signals WHERE entity_id = $1 ORDER BY detected_at DESC',
      [id],
    );

    reply.send({ success: true, data: result.rows });
  });
}
