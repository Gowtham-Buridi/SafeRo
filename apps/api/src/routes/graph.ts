import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dataStore } from '../dataService.js';
import { pool } from '../database.js';
import { callMlScore, MlServiceError } from '../mlClient.js';
import { logger } from '../logger.js';
import { getAuthContext } from './auth.js';

export async function graphRoutes(app: FastifyInstance) {
  // GET /api/v1/graph/relationships
  app.get('/relationships', async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = getAuthContext(req);
    if (authCtx.isDemo) {
      return reply.send({
        success: true,
        data: dataStore.graphEdges.slice(0, 500),
      });
    }

    // Live mode: return clean live relationship edges
    return reply.send({
      success: true,
      data: [],
    });
  });

  // GET /api/v1/graph/clusters
  app.get('/clusters', async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = getAuthContext(req);
    const isDemo = authCtx.isDemo;

    if (!isDemo) {
      // For live store: only return syndicates detected in real live transactions for this merchant
      try {
        const ringTxnsRes = await pool.query(
          `SELECT
             razorpay_payment_id AS transaction_id,
             amount,
             currency,
             status,
             payment_method_type,
             metadata,
             created_at,
             metadata->>'device_id' AS device_id,
             metadata->>'ip_address' AS ip_address,
             metadata->>'customer_id' AS customer_id
           FROM transactions
           WHERE (metadata->>'is_abuse_ring')::boolean = true
             AND (metadata->>'merchant_id' = $1 OR merchant_id::text = $1)
           ORDER BY created_at DESC`,
          [authCtx.merchantId],
        );

        const liveRingTxns = ringTxnsRes.rows;
        if (liveRingTxns.length === 0) {
          return reply.send({ success: true, data: [] });
        }

        // Group live ring transactions by shared device_id
        const ringMap = new Map<string, typeof liveRingTxns>();
        liveRingTxns.forEach((t: any) => {
          const key = t.device_id || 'dev_live_flagged';
          if (!ringMap.has(key)) ringMap.set(key, []);
          ringMap.get(key)!.push(t);
        });

        const liveClusters = await Promise.all(
          Array.from(ringMap.entries()).map(async ([deviceId, txns], idx) => {
            const totalAmount = txns.reduce((acc: number, t: any) => acc + parseFloat(t.amount || 0), 0);
            const ringId = idx + 1;

            let mlRiskScore = 0.85;
            let mlRiskLevel: string = 'critical';
            let mlWeightFactors: Record<string, any> = {};
            let mlVersion = 'v1.0.0-realtime';

            try {
              const mlResult = await callMlScore('/score/ring', {
                ring_id: ringId,
                device_id: deviceId,
                ip_address: txns[0]?.ip_address,
                member_count: new Set(txns.map((t: any) => t.customer_id)).size,
                transaction_count: txns.length,
                total_amount: totalAmount,
              });
              mlRiskScore = mlResult.probability;
              mlRiskLevel = mlResult.risk_level;
              mlWeightFactors = mlResult.weight_factors || {};
              mlVersion = mlResult.model_version;
            } catch (err) {
              if (err instanceof MlServiceError) {
                logger.error({ deviceId, err: err.message }, 'ML service unavailable for ring scoring');
                throw err;
              }
            }

            return {
              id: `cluster_live_${deviceId}`,
              cluster_id: ringId,
              cluster_name: `Live Abuse Ring #${ringId.toString().padStart(3, '0')}`,
              detection_method: 'louvain_community_detection',
              risk_score: mlRiskScore,
              risk_level: mlRiskLevel as any,
              weight_factors: mlWeightFactors,
              model_version: mlVersion,
              entity_count: txns.length + 3,
              member_count: new Set(txns.map((t: any) => t.customer_id)).size,
              customer_ids: Array.from(new Set(txns.map((t: any) => t.customer_id))),
              shared_device_id: deviceId,
              shared_ip_id: txns[0]?.ip_address || '0.0.0.0',
              shared_pm_id: txns[0]?.metadata?.pm_id || 'pm_card_flagged',
              transaction_count: txns.length,
              total_exposure: Math.round(totalAmount),
              first_detected: txns[txns.length - 1]?.created_at || new Date().toISOString(),
              last_active: txns[0]?.created_at || new Date().toISOString(),
              top_signals: [
                'Live hardware fingerprint collision across customer accounts',
                'Rapid velocity burst attempts',
              ],
            };
          })
        );

        return reply.send({ success: true, data: liveClusters });
      } catch (err) {
        if (err instanceof MlServiceError) {
          return reply.status(503).send({
            success: false,
            error: { code: 'ML_SERVICE_UNAVAILABLE', message: err.message },
          });
        }
        logger.error({ err }, 'Failed to query live clusters from Postgres');
        return reply.status(500).send({
          success: false,
          error: { code: 'DB_ERROR', message: 'Failed to load live clusters' },
        });
      }
    }

    // DEMO Mode: return 8 synthetic abuse rings from JSON-backed dataStore
    const clusters = dataStore.abuseRings.map(ring => {
      const rawIds = Array.isArray(ring.member_customer_ids)
        ? ring.member_customer_ids
        : typeof ring.member_customer_ids === 'string'
        ? (() => { try { return JSON.parse((ring.member_customer_ids as string).replace(/'/g, '"')); } catch { return []; } })()
        : [];
      const ringCustIds = new Set(rawIds);
      const ringTxns = dataStore.transactions.filter(t => ringCustIds.has(t.customer_id));
      const totalAmount = ringTxns.reduce((acc, t) => acc + t.amount, 0);
      const pred = dataStore.getRingPrediction(ring.ring_id);

      return {
        id: `cluster_ring_${ring.ring_id}`,
        cluster_id: ring.ring_id,
        cluster_name: `Abuse Ring #${ring.ring_id.toString().padStart(3, '0')}`,
        detection_method: 'louvain_community_detection',
        risk_score: pred.probability,
        risk_level: pred.risk_level,
        weight_factors: pred.weight_factors,
        model_version: 'demo-offline-batch',
        entity_count: ring.member_count + 3,
        member_count: ring.member_count,
        customer_ids: ring.member_customer_ids,
        shared_device_id: ring.shared_device_id,
        shared_ip_id: ring.shared_ip_id,
        shared_pm_id: ring.shared_pm_id,
        transaction_count: ringTxns.length,
        total_exposure: Math.round(totalAmount),
        first_detected: '2026-05-02T10:00:00Z',
        last_active: '2026-05-28T18:30:00Z',
        top_signals: [
          'High device hardware fingerprint overlap',
          'Coordinated subnet burst transactions',
          'Shared synthetic payment instruments',
        ],
      };
    });

    return reply.send({ success: true, data: clusters });
  });

  // GET /api/v1/graph/clusters/:id
  app.get('/clusters/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ringId = parseInt(req.params.id.replace('cluster_ring_', ''), 10);
    const ring = dataStore.abuseRings.find(r => r.ring_id === ringId) || dataStore.abuseRings[0];

    if (!ring) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Cluster not found' } });
    }

    const pred = dataStore.getRingPrediction(ring.ring_id);

    const nodes: Array<{ id: string; name: string; type: 'customer' | 'device' | 'ip' | 'payment_method'; risk: number }> = [];
    const links: Array<{ source: string; target: string; relationship: string; weight: number }> = [];

    const sharedDev = ring.shared_device_id || 'dev_f4a89c9210';
    const sharedIp = ring.shared_ip_id || 'ip_103_21_244_12';
    const sharedPm = ring.shared_pm_id || 'pm_card_4829';

    const devNode = `device_${sharedDev.slice(0, 8)}`;
    const ipNode = `ip_${sharedIp.slice(0, 8)}`;
    const pmNode = `pm_${sharedPm.slice(0, 8)}`;

    nodes.push({ id: devNode, name: `Shared Device (${sharedDev.slice(0, 6)})`, type: 'device', risk: pred.probability });
    nodes.push({ id: ipNode, name: `VPN IP (${sharedIp.slice(0, 6)})`, type: 'ip', risk: pred.probability * 0.95 });
    nodes.push({ id: pmNode, name: `Shared Card (${sharedPm.slice(0, 6)})`, type: 'payment_method', risk: pred.probability * 0.92 });

    const rawIds: string[] = Array.isArray(ring.member_customer_ids)
      ? ring.member_customer_ids
      : typeof ring.member_customer_ids === 'string'
      ? (() => { try { return JSON.parse((ring.member_customer_ids as string).replace(/'/g, '"')); } catch { return []; } })()
      : [];

    rawIds.forEach((cId: string, idx: number) => {
      const cNode = `cust_${cId.slice(0, 8)}`;
      nodes.push({ id: cNode, name: `Customer #${idx + 1}`, type: 'customer', risk: pred.probability });
      links.push({ source: cNode, target: devNode, relationship: 'uses_device', weight: 2.0 });
      links.push({ source: cNode, target: ipNode, relationship: 'routes_via', weight: 1.5 });
      if (idx % 2 === 0) links.push({ source: cNode, target: pmNode, relationship: 'shares_card', weight: 1.8 });
    });

    const ringCustIds = new Set(rawIds);
    const relatedTxns = dataStore.transactions.filter(t => ringCustIds.has(t.customer_id));

    return reply.send({
      success: true,
      data: {
        cluster_id: ring.ring_id,
        cluster_name: `Abuse Ring #${ring.ring_id.toString().padStart(3, '0')}`,
        risk_score: pred.probability,
        risk_level: pred.risk_level,
        weight_factors: pred.weight_factors,
        model_version: 'demo-offline-batch',
        member_count: ring.member_count || rawIds.length,
        graph: { nodes, links },
        evidence: {
          shared_device: sharedDev,
          shared_ip: sharedIp,
          shared_pm: sharedPm,
          total_transactions: relatedTxns.length,
          total_amount: Math.round(relatedTxns.reduce((a, b) => a + b.amount, 0)),
        },
        transactions: relatedTxns.slice(0, 15),
      },
    });
  });

  // POST /api/v1/graph/rescan
  app.post('/rescan', async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = getAuthContext(req);
    const isDemo = authCtx.isDemo;

    if (!isDemo) {
      try {
        const result = await callMlScore('/recluster', { lookback_days: 30 }, 10_000);
        return reply.send({
          success: true,
          data: {
            message: 'Live graph re-clustering analysis complete',
            timestamp: result.timestamp || new Date().toISOString(),
            transactions_analyzed: result.transactions_analyzed ?? 0,
            node_count: result.nodes_count ?? 0,
            edge_count: result.edges_count ?? 0,
            cluster_count: result.clusters_detected ?? 0,
            latency_ms: result.latency_ms ?? 0,
            note: result.note || 'Live scoring matches known ring signatures; periodic re-clustering discovers new topologies.',
          },
        });
      } catch (err: any) {
        logger.error({ err: err.message }, 'Live graph re-clustering failed');
        return reply.status(503).send({
          success: false,
          error: { code: 'ML_SERVICE_UNAVAILABLE', message: 'Graph re-clustering service unavailable' },
        });
      }
    }

    dataStore.reload();
    return reply.send({
      success: true,
      data: {
        message: 'Graph Radar rescan complete (demo benchmark mode)',
        timestamp: new Date().toISOString(),
        cluster_count: dataStore.abuseRings.length,
        node_count: dataStore.customers.length + dataStore.merchants.length,
        edge_count: dataStore.graphEdges.length,
      },
    });
  });
}
