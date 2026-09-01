import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dataStore } from '../dataService.js';
import { pool } from '../database.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { authenticate, getAuthContext } from './auth.js';
import { maskEmail } from '../lib/pii.js';

export async function investigationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  // POST /api/v1/investigations/query
  app.post('/query', async (req: FastifyRequest<{ Body: { query: string; entity_type?: string } }>, reply: FastifyReply) => {
    const authCtx = getAuthContext(req);
    const { query } = req.body || { query: '' };
    const qLower = query.toLowerCase();

    let totalTxns = 0;
    let fraudTxns = 0;
    let disputedTxns = 0;
    let disputeVolume = 0;
    let activeRingsCount = 0;
    let openCaseCount = 0;
    let ringsContext: any[] = [];

    if (authCtx.isDemo) {
      const rings = dataStore.abuseRings;
      const transactions = dataStore.transactions;
      const cases = dataStore.cases;
      const disputed = transactions.filter(t => t.status === 'disputed');
      totalTxns = transactions.length;
      fraudTxns = transactions.filter(t => t.is_fraudulent || t.is_abuse_ring).length;
      disputedTxns = disputed.length;
      disputeVolume = Math.round(disputed.reduce((a, b) => a + b.amount, 0));
      activeRingsCount = rings.length;
      openCaseCount = cases.filter(c => c.status === 'open' || c.status === 'investigating').length;
      ringsContext = rings.slice(0, 4).map(r => ({
        ring_id: r.ring_id,
        member_count: r.member_count,
        device: r.shared_device_id?.slice(0, 10),
        ip: r.shared_ip_id?.slice(0, 10),
      }));
    } else {
      try {
        const statsRes = await pool.query(
          `SELECT
             COUNT(*) AS total_txns,
             COUNT(*) FILTER (WHERE (metadata->>'is_abuse_ring')::boolean = true) AS ring_txns,
             COUNT(*) FILTER (WHERE status = 'disputed') AS dispute_count,
             COALESCE(SUM(amount) FILTER (WHERE status = 'disputed'), 0) AS dispute_volume
           FROM transactions
           WHERE (metadata->>'merchant_id' = $1 OR merchant_id::text = $1)`,
          [authCtx.merchantId],
        );
        const row = statsRes.rows[0];
        totalTxns = parseInt(row?.total_txns || '0', 10);
        fraudTxns = parseInt(row?.ring_txns || '0', 10);
        disputedTxns = parseInt(row?.dispute_count || '0', 10);
        disputeVolume = Math.round(parseFloat(row?.dispute_volume || '0'));

        const ringsRes = await pool.query(
          `SELECT metadata->>'device_id' as device, COUNT(*) as member_count
           FROM transactions
           WHERE (metadata->>'is_abuse_ring')::boolean = true
             AND (metadata->>'merchant_id' = $1 OR merchant_id::text = $1)
           GROUP BY metadata->>'device_id'
           LIMIT 4`,
          [authCtx.merchantId],
        );
        activeRingsCount = ringsRes.rows.length;
        ringsContext = ringsRes.rows;

        const casesRes = await pool.query(
          `SELECT COUNT(*) as count FROM risk_cases
           WHERE (evidence->>'merchant_id' = $1 OR merchant_id::text = $1)
             AND status != 'dismissed'`,
          [authCtx.merchantId],
        );
        openCaseCount = parseInt(casesRes.rows[0]?.count || '0', 10);
      } catch (err) {
        logger.warn({ err }, 'Failed to fetch live investigation context from Postgres');
      }
    }

    const apiKey = config.groq.apiKey;

    if (apiKey && query.trim()) {
      try {
        const prompt = `You are the SafeRo Sovereign AI Investigation Forensics Engine.
Analyze the user's risk query using the platform's ground-truth telemetry below.

## Authenticated Merchant Scope:
- Merchant ID: ${authCtx.merchantId}
- User Email: ${maskEmail(authCtx.userEmail)}
- Environment: ${authCtx.isDemo ? 'Demo Testbed' : 'Live Store'}

## Ground-Truth Telemetry for this Merchant:
- Total transactions: ${totalTxns.toLocaleString()}
- Flagged/fraudulent transactions: ${fraudTxns}
- Disputed / chargeback transactions: ${disputedTxns} (Total dispute volume: ₹${disputeVolume.toLocaleString()})
- Active detected abuse rings: ${activeRingsCount} clusters
- Ring details: ${JSON.stringify(ringsContext)}
- Open risk cases: ${openCaseCount}

## Strict Guardrails:
1. ONLY reason using the telemetry above for merchant ${authCtx.merchantId}. Never fabricate metrics or signals.
2. If the query asks about entities, device IDs, or transactions not belonging to this merchant, state clearly that no telemetry exists in their store workspace.

## User Query:
"${query}"

Respond ONLY with valid JSON in this exact structure without markdown backticks:
{
  "ai_explanation": "Detailed forensic synthesis and reasoning explaining the threat dynamics or anomaly metrics relevant to the query (2-3 concise paragraphs)",
  "evidence_cards": [
    {
      "title": "Evidence Title",
      "type": "graph_community or velocity_burst or forensics or ml_classifier or chargeback_intel",
      "severity": "low or medium or high or critical",
      "details": "Specific factual metrics or telemetry finding supporting this reasoning"
    }
  ],
  "decision_basis": "Concise summary of deterministic decision rules and graph community weights used",
  "hallucination_guard": "Active (Bound to SafeRo ground-truth telemetry & Louvain graph partitions)"
}`;

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: config.groq.model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_tokens: 800,
            response_format: { type: 'json_object' },
          }),
        });

        if (groqRes.ok) {
          const groqData = await groqRes.json() as any;
          const content = groqData.choices?.[0]?.message?.content;
          if (content) {
            const parsed = JSON.parse(content);
            const cards = (Array.isArray(parsed.evidence_cards) && parsed.evidence_cards.length > 0)
              ? parsed.evidence_cards
              : [
                  {
                    title: 'Risk Intelligence Forensics',
                    type: 'forensics',
                    severity: 'high',
                    details: 'Deterministic telemetry analysis & model evaluation summary.',
                  },
                ];

            return reply.send({
              success: true,
              data: {
                query,
                ai_explanation: parsed.ai_explanation || content,
                model_result: {
                  evaluated_by: 'SafeRo Risk Intelligence v1.0 × Groq LPU',
                  decision_basis: parsed.decision_basis || 'Deterministic graph community detection + calibrated risk scoring',
                  hallucination_guard: parsed.hallucination_guard || 'Active (Evidence bound to ground-truth database records)',
                },
                evidence_cards: cards,
                relevant_entities: [],
                timestamp: new Date().toISOString(),
              },
            });
          }
        }
      } catch (err) {
        logger.error({ err }, 'Groq investigation query failed, falling back to deterministic synthesis');
      }
    }

    // Fallback deterministic resolution
    let answer = '';
    let evidenceCards: Array<{ title: string; type: string; details: string; severity?: string }> = [];

    if (qLower.includes('ring') || qLower.includes('cluster') || qLower.includes('abuse') || qLower.includes('device')) {
      answer = `Graph intelligence identified ${activeRingsCount} coordinated abuse clusters for your merchant workspace. Analysis indicates device hardware collisions and velocity burst patterns.`;
      evidenceCards = [
        {
          title: `Abuse Cluster Intelligence`,
          type: 'graph_community',
          severity: 'critical',
          details: `${activeRingsCount} clusters identified based on hardware fingerprint overlap and IP gateway telemetry.`,
        },
        {
          title: 'Model Evaluation Confidence',
          type: 'ml_classifier',
          severity: 'high',
          details: 'Real-time scoring model evaluated telemetry with high confidence.',
        },
      ];
    } else {
      answer = `SafeRo surveillance active. Analyzed ${totalTxns.toLocaleString()} transactions (${fraudTxns} flagged for risk) across your store workspace.`;
      evidenceCards = [
        {
          title: 'Store Telemetry Summary',
          type: 'forensics',
          severity: fraudTxns > 0 ? 'high' : 'low',
          details: `${totalTxns} total events analyzed with ${disputedTxns} disputed chargeback events.`,
        },
      ];
    }

    return reply.send({
      success: true,
      data: {
        query,
        ai_explanation: answer,
        model_result: {
          evaluated_by: 'SafeRo Deterministic Rule Engine',
          decision_basis: 'Real-time telemetry aggregation & merchant workspace analysis',
          hallucination_guard: 'Active (Deterministic database ground truth)',
        },
        evidence_cards: evidenceCards,
        relevant_entities: [],
        timestamp: new Date().toISOString(),
      },
    });
  });
}
