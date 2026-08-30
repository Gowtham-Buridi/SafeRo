import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { dataStore } from '../dataService.js';
import { pool } from '../database.js';
import { logger } from '../logger.js';
import { getAuthContext, type AuthContext } from './auth.js';

import { maskEmail } from '../lib/pii.js';

// ─── Build a grounded system prompt scoped to user's tenant context ───
async function buildSystemPrompt(authCtx: AuthContext): Promise<string> {
  let totalTxns = 0;
  let totalVolume = 0;
  let fraudTxns = 0;
  let disputedTxns = 0;
  let ringsSummary = '';
  let casesSummary = '';
  let openCaseCount = 0;
  let activeRingCount = 0;

  if (authCtx.isDemo) {
    const rings = dataStore.abuseRings;
    const transactions = dataStore.transactions;
    const cases = dataStore.cases;
    totalTxns = transactions.length;
    totalVolume = transactions.reduce((s, t) => s + t.amount, 0);
    fraudTxns = transactions.filter((t) => t.is_fraudulent || t.is_abuse_ring).length;
    disputedTxns = transactions.filter((t) => t.status === 'disputed').length;
    const openCases = cases.filter((c) => c.status === 'open' || c.status === 'investigating');
    openCaseCount = openCases.length;
    activeRingCount = rings.length;

    ringsSummary = rings.slice(0, 5)
      .map((r) => `  - Ring #${r.ring_id}: ${r.member_count} accounts, device fingerprint ${r.shared_device_id?.slice(0, 12)}, IP ${r.shared_ip_id?.slice(0, 12)}`)
      .join('\n');

    casesSummary = openCases.slice(0, 5)
      .map((c) => `  - [${c.severity.toUpperCase()}] ${c.title} (risk: ${(c.risk_score * 100).toFixed(0)}%)`)
      .join('\n');
  } else {
    // Query FRESH live telemetry from Postgres scoped strictly to authenticated merchant
    try {
      const statsRes = await pool.query(
        `SELECT
           COUNT(*) AS total_txns,
           COALESCE(SUM(amount), 0) AS total_volume,
           COUNT(*) FILTER (WHERE (metadata->>'is_abuse_ring')::boolean = true) AS ring_txns,
           COUNT(*) FILTER (WHERE status = 'disputed') AS dispute_count
         FROM transactions
         WHERE (metadata->>'merchant_id' = $1 OR merchant_id::text = $1)`,
        [authCtx.merchantId],
      );
      const row = statsRes.rows[0];
      totalTxns = parseInt(row?.total_txns || '0', 10);
      totalVolume = parseFloat(row?.total_volume || '0');
      fraudTxns = parseInt(row?.ring_txns || '0', 10);
      disputedTxns = parseInt(row?.dispute_count || '0', 10);

      // Fetch live cases
      const casesRes = await pool.query(
        `SELECT id, title, severity, risk_score, status
         FROM risk_cases
         WHERE (evidence->>'merchant_id' = $1 OR merchant_id::text = $1)
           AND status != 'dismissed'
         LIMIT 5`,
        [authCtx.merchantId],
      );
      openCaseCount = casesRes.rows.length;
      casesSummary = casesRes.rows
        .map((c) => `  - [${(c.severity || 'high').toUpperCase()}] ${c.title} (risk: ${(parseFloat(c.risk_score || 0.85) * 100).toFixed(0)}%)`)
        .join('\n');

      // Fetch live rings
      const ringsRes = await pool.query(
        `SELECT metadata->>'device_id' as device_id, COUNT(*) as txn_count, SUM(amount) as ring_volume
         FROM transactions
         WHERE (metadata->>'is_abuse_ring')::boolean = true
           AND (metadata->>'merchant_id' = $1 OR merchant_id::text = $1)
         GROUP BY metadata->>'device_id'
         LIMIT 5`,
        [authCtx.merchantId],
      );
      activeRingCount = ringsRes.rows.length;
      ringsSummary = ringsRes.rows
        .map((r, idx) => `  - Live Cluster #${idx + 1}: ${r.txn_count} transactions, device ${r.device_id?.slice(0, 12)}, exposure ₹${parseFloat(r.ring_volume || 0).toLocaleString()}`)
        .join('\n');
    } catch (err) {
      logger.warn({ err }, 'Failed to load live AI telemetry context from Postgres');
    }
  }

  return `You are SafeRo AI — a sovereign fraud risk analyst embedded in the SafeRo merchant risk intelligence platform.

## Authenticated Merchant Scope
- **User Email:** ${maskEmail(authCtx.userEmail)}
- **Merchant Tenant ID:** ${authCtx.merchantId}
- **Environment:** ${authCtx.isDemo ? 'Demo Testbed Dataset' : 'Live Merchant Store'}

## Real Backend Telemetry (Strict Ground Truth for this Merchant):
- **Total transactions analyzed:** ${totalTxns.toLocaleString()}
- **Total transaction volume:** ₹${(totalVolume / 1_000_000).toFixed(2)}M
- **Flagged / Abuse Ring transactions:** ${fraudTxns}
- **Disputed / Chargeback transactions:** ${disputedTxns}
- **Active abuse ring clusters detected:** ${activeRingCount}
- **Open risk cases:** ${openCaseCount}

## Active Ring Clusters:
${ringsSummary || '  - No active abuse clusters detected in this merchant workspace'}

## Open Risk Cases:
${casesSummary || '  - No active risk cases in this merchant workspace'}

## CRITICAL AI GUARDRAILS (MUST STRICTLY FOLLOW):
1. **GROUNDED TRUTH ONLY**: You MUST only explain, analyze, and reason using the REAL telemetry, risk scores, signals, and evidence provided above for the CURRENT authenticated user (${authCtx.merchantId}). NEVER invent fake probabilities, hallucinate transaction counts, or fabricate signals.
2. **MULTI-TENANT DATA ISOLATION & REFUSAL**: If the user asks about an entity, customer ID, device fingerprint, transaction ID, or abuse ring that does NOT exist in their workspace evidence above, you MUST explicitly state that no such entity exists within their store workspace and refuse to answer. NEVER disclose or speculate about data outside their tenant.
3. **STRUCTURED TRIAGE ACTIONS**: When responding to risk questions or case reviews, provide clear forensic insights and concise markdown checklists:
   - - [ ] **Block Device Fingerprint** (device_hash) — Proactively deny incoming velocity bursts.
   - - [ ] **Hold Settlement & Enforce 3DS** — Place 48h payout freeze and require biometric verification.
   - - [ ] **Throttle IP Subnet Velocity** — Enforce rate-limiting on shared proxy/datacenter nodes.
   - - [ ] **Dispatch Merchant Gateway Webhook** — Push real-time alert payload to integration endpoint.`;
}

// ─── Groq AI Chat Route ────────────────────────────────────────
export async function aiRoutes(app: FastifyInstance) {
  app.post('/chat', async (
    req: FastifyRequest<{
      Body: {
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      };
    }>,
    reply: FastifyReply,
  ) => {
    const authCtx = getAuthContext(req);
    const { messages } = req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'messages array is required' },
      });
    }

    const apiKey = config.groq.apiKey;

    if (!apiKey) {
      logger.warn('GROQ_API_KEY not set');
      return reply.send({
        success: true,
        data: {
          role: 'assistant',
          content: `⚠️ **Groq AI not configured.** Add your \`GROQ_API_KEY\` to the \`.env\` file and restart the API server.\n\nGet your free API key at [console.groq.com](https://console.groq.com).`,
        },
      });
    }

    try {
      const systemPrompt = await buildSystemPrompt(authCtx);

      const groqPayload = {
        model: config.groq.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.2,
        max_tokens: 700,
        stream: false,
      };

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(groqPayload),
        signal: AbortSignal.timeout(15000),
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        logger.error({ status: groqRes.status, body: errText }, 'Groq API error');
        return reply.status(groqRes.status === 429 ? 429 : 502).send({
          success: false,
          error: {
            code: groqRes.status === 429 ? 'GROQ_RATE_LIMITED' : 'GROQ_API_ERROR',
            message: groqRes.status === 429
              ? 'Groq AI rate limit reached. Please wait a moment before trying again.'
              : `Groq AI service error (${groqRes.status}). Please retry shortly.`,
          },
        });
      }

      const groqData = await groqRes.json() as {
        choices: Array<{
          message: { role: string; content: string };
          finish_reason: string;
        }>;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      const aiMessage = groqData.choices?.[0]?.message;

      if (!aiMessage?.content) {
        return reply.status(502).send({
          success: false,
          error: { code: 'GROQ_EMPTY_RESPONSE', message: 'No content returned from AI provider' },
        });
      }

      return reply.send({
        success: true,
        data: {
          role: 'assistant',
          content: aiMessage.content,
          usage: groqData.usage,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Groq AI request exception');
      return reply.status(503).send({
        success: false,
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message: err?.message?.includes('timeout')
            ? 'AI analysis timed out. Please try again.'
            : 'AI assistant service temporarily unavailable.',
        },
      });
    }
  });
}
