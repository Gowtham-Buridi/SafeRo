import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dataStore } from '../dataService.js';
import { logger } from '../logger.js';
import * as caseStore from '../caseStore.js';
import { getAuthContext } from './auth.js';

// ── Severity resolver ───────────────────────────────────────────
function computeSeverity(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= 0.75) return 'critical';
  if (score >= 0.50) return 'high';
  if (score >= 0.25) return 'medium';
  return 'low';
}

// ── Real merchant webhook dispatcher ───────────────────────────
async function dispatchMerchantWebhook(caseData: any, actor: string): Promise<void> {
  try {
    // Look up the merchant's webhook URL from the data store
    const merchant = dataStore.merchants.find(m => m.merchant_id === caseData.merchant_id);
    const webhookUrl = (merchant as any)?.webhook_url;

    const payload = {
      event: 'safero.fraud_alert',
      timestamp: new Date().toISOString(),
      case_id: caseData.id,
      title: caseData.title,
      severity: caseData.severity,
      risk_score: caseData.risk_score,
      signals: (caseData.signals ?? []).map((s: any) => ({
        type: s.signal_type,
        description: s.message,
      })),
      recommended_action: 'Review and suspend affected accounts pending investigation.',
      dispatched_by: actor,
    };

    if (webhookUrl) {
      // Fire real HTTP webhook to merchant's registered URL
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-SafeRo-Event': 'fraud_alert' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      logger.info({ merchantId: caseData.merchant_id, status: res.status }, 'Merchant webhook dispatched');
    } else {
      // No webhook URL configured — log the payload (in production, queue for retry)
      logger.info(
        { caseId: caseData.id, merchantId: caseData.merchant_id, payload },
        'Merchant webhook payload ready — no webhook URL configured for merchant (logged for audit)',
      );
    }
  } catch (err) {
    logger.warn({ err, caseId: caseData.id }, 'Merchant webhook dispatch failed (non-blocking)');
  }
}

export async function caseRoutes(app: FastifyInstance) {

  // ── GET /api/v1/cases ────────────────────────────────────────
  app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = getAuthContext(req);
    const query = req.query as { status?: string };

    if (!authCtx.isDemo) {
      const liveCases = await caseStore.getAllCases(query.status, authCtx.merchantId);
      return reply.send({ success: true, data: liveCases });
    }

    const cases = await caseStore.getAllCases(query.status);
    return reply.send({ success: true, data: cases });
  });

  // ── GET /api/v1/cases/:id ────────────────────────────────────
  app.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const authCtx = getAuthContext(req);
    const c = await caseStore.getCaseById(req.params.id, authCtx.isDemo ? undefined : authCtx.merchantId);
    if (!c) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Case not found' } });
    }
    return reply.send({ success: true, data: c });
  });

  // ── POST /api/v1/cases ───────────────────────────────────────
  app.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = getAuthContext(req);
    const body = (req.body as Record<string, any>) || {};
    const clusterId = body.cluster_id !== undefined ? Number(body.cluster_id) : undefined;

    let ringPred = clusterId !== undefined ? dataStore.getRingPrediction(clusterId) : null;
    let ring = clusterId !== undefined ? dataStore.abuseRings.find(r => r.ring_id === clusterId) : null;

    // Deduplicate active cases for the same ring
    if (clusterId !== undefined) {
      const existing = await caseStore.getCaseById(`case_escalated_ring_${clusterId}`, authCtx.isDemo ? undefined : authCtx.merchantId);
      if (existing && existing.status !== 'resolved' && existing.status !== 'dismissed') {
        const updated = await caseStore.updateCase(existing.id, {
          title: body.title || existing.title,
          signals: body.signals?.length > 0 ? body.signals : existing.signals,
          updated_at: new Date().toISOString(),
        });
        return reply.status(201).send({ success: true, data: updated || existing, deduplicated: true });
      }
    }

    const caseId = body.id || (clusterId !== undefined ? `case_escalated_ring_${clusterId}` : `case_custom_${Date.now()}`);
    const riskScore = typeof body.risk_score === 'number' ? body.risk_score : (ringPred ? ringPred.probability : 0.92);
    const severity = (body.severity as any) || computeSeverity(riskScore);
    const actor = body.actor || body.escalated_by || (body.assigned_to && body.assigned_to !== 'Unassigned' ? body.assigned_to : 'Analyst');

    const defaultSignals = ring ? [
      { signal_type: 'device_sharing', severity: 'high', polarity: 'negative', message: `${ring.member_count} accounts sharing device ${ring.shared_device_id?.slice(0, 8)}` },
      { signal_type: 'ip_cluster', severity: 'high', polarity: 'negative', message: `Coordinated activity originating from IP ${ring.shared_ip_id?.slice(0, 8)}` },
      { signal_type: 'escalation', severity: 'high', polarity: 'negative', message: 'Escalated to formal investigation from Abuse Rings Radar' },
    ] : [
      { signal_type: 'escalation', severity: 'high', polarity: 'negative', message: 'Escalated to formal investigation from SafeRo Surveillance' },
    ];

    const defaultTags = body.typology_tags?.length > 0
      ? body.typology_tags
      : (clusterId !== undefined ? ['#AbuseRing', '#DeviceCollusion'] : ['#SuspiciousVelocity', '#IncidentEscalation']);

    const defaultChecklist = [
      {
        id: `chk_${caseId}_1`,
        title: body.customer_id
          ? `Freeze Account & Require Verification (${body.customer_id.slice(0, 8)})`
          : `Block Device (${ring?.shared_device_id?.slice(0, 8) || 'Hardware Node'})`,
        completed: Boolean(body.mitigations?.device_blocked || body.mitigations?.customer_held),
        action_type: body.customer_id ? 'freeze_customer' : 'block_device',
        entity_val: body.customer_id || ring?.shared_device_id,
      },
      {
        id: `chk_${caseId}_2`,
        title: `Alert the merchant via webhook`,
        completed: Boolean(body.mitigations?.merchant_notified),
        action_type: 'alert_merchant',
      },
      {
        id: `chk_${caseId}_3`,
        title: 'Step-up Authentication (3DS Mandatory)',
        completed: Boolean(body.mitigations?.ip_throttled),
        action_type: 'step_up_auth',
      },
      {
        id: `chk_${caseId}_4`,
        title: 'File Formal Case Resolution',
        completed: false,
        action_type: 'resolve_case',
      },
    ];

    const initialAuditTrail = [
      {
        id: `aud_${caseId}_created`,
        timestamp: new Date().toISOString(),
        actor,
        action: 'Case Escalated',
        details: body.title
          ? `Escalated: "${body.title}" with risk score ${(riskScore * 100).toFixed(1)}%`
          : clusterId !== undefined
          ? `Escalated Abuse Ring #${clusterId} to active triage queue`
          : `Escalated transaction incident for priority review`,
      },
    ];

    if (body.mitigations?.device_blocked) {
      initialAuditTrail.push({
        id: `aud_${caseId}_mit_dev`,
        timestamp: new Date().toISOString(),
        actor,
        action: 'Device Blacklisted',
        details: 'Enacted proactive hardware token blocklist rule.',
      });
    }
    if (body.mitigations?.merchant_notified) {
      initialAuditTrail.push({
        id: `aud_${caseId}_mit_notif`,
        timestamp: new Date().toISOString(),
        actor,
        action: 'Merchant Webhook Dispatched',
        details: 'Dispatched automated fraud alert payload to integration endpoint.',
      });
    }
    if (body.mitigations?.customer_held) {
      initialAuditTrail.push({
        id: `aud_${caseId}_mit_cust`,
        timestamp: new Date().toISOString(),
        actor,
        action: 'Customer Frozen',
        details: 'Applied 48h freeze and extra verification step.',
      });
    }

    const newCase = {
      id: caseId,
      title: body.title || (clusterId !== undefined
        ? `Coordinated Ring #${clusterId.toString().padStart(3, '0')} (${ring ? ring.member_count : 6} Accounts)`
        : `Investigative Case #${Date.now().toString().slice(-4)}`),
      merchant_id: authCtx.merchantId,
      customer_id: body.customer_id,
      status: 'open' as const,
      severity: severity as any,
      risk_score: riskScore,
      assigned_to: body.assigned_to || 'Unassigned',
      signals: body.signals?.length > 0 ? body.signals : defaultSignals,
      typology_tags: defaultTags,
      notes: body.notes || '',
      ai_summary: body.ai_summary || (
        clusterId !== undefined
          ? `Coordinated pattern detected across ${ring?.member_count || 'multiple'} accounts. Immediate action recommended.`
          : `Case escalated with ${(riskScore * 100).toFixed(1)}% risk score. Review signals below.`
      ),
      action_checklist: body.action_checklist || defaultChecklist,
      audit_trail: initialAuditTrail,
      mitigations: body.mitigations || { device_blocked: false, ip_throttled: false, customer_held: false, merchant_notified: false },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const saved = await caseStore.createCase(newCase);
    return reply.status(201).send({ success: true, data: saved });
  });

  // ── PATCH /api/v1/cases/:id/checklist/:checklistId ───────────
  app.patch('/:id/checklist/:checklistId', async (
    req: FastifyRequest<{ Params: { id: string; checklistId: string }; Body: { completed: boolean; actor?: string } }>,
    reply: FastifyReply,
  ) => {
    const { completed, actor } = req.body || {};
    const updated = await caseStore.toggleChecklist(req.params.id, req.params.checklistId, Boolean(completed), actor || 'Analyst');
    if (!updated) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Case not found' } });
    }
    return reply.send({ success: true, data: updated });
  });

  // ── POST /api/v1/cases/:id/mitigations ──────────────────────
  app.post('/:id/mitigations', async (
    req: FastifyRequest<{ Params: { id: string }; Body: { mitigation_type: string; active: boolean; actor?: string } }>,
    reply: FastifyReply,
  ) => {
    const { mitigation_type, active, actor } = req.body || {};
    if (!mitigation_type) {
      return reply.status(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'mitigation_type is required' } });
    }

    const updated = await caseStore.toggleMitigation(req.params.id, mitigation_type, Boolean(active), actor || 'Analyst');
    if (!updated) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Case not found' } });
    }

    // Fire real webhook when merchant is notified
    if (mitigation_type === 'merchant_notified' && Boolean(active)) {
      dispatchMerchantWebhook(updated, actor || 'Analyst').catch(() => {});
    }

    return reply.send({ success: true, data: updated });
  });

  // ── POST /api/v1/cases/:id/notes ─────────────────────────────
  app.post('/:id/notes', async (
    req: FastifyRequest<{ Params: { id: string }; Body: { note: string; actor?: string } }>,
    reply: FastifyReply,
  ) => {
    const { note, actor } = req.body || {};
    if (!note?.trim()) {
      return reply.status(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'note is required' } });
    }
    const updated = await caseStore.addNote(req.params.id, actor || 'Analyst', note.trim());
    if (!updated) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Case not found' } });
    }
    return reply.send({ success: true, data: updated });
  });

  // ── DELETE /api/v1/cases/:id/audit ───────────────────────────
  app.delete('/:id/audit', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const updated = await caseStore.clearAuditTrail(req.params.id);
    if (!updated) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Case not found' } });
    }
    return reply.send({ success: true, data: updated });
  });

  // ── PATCH /api/v1/cases/:id/status ──────────────────────────
  app.patch('/:id/status', async (
    req: FastifyRequest<{ Params: { id: string }; Body: { status: string; notes?: string; actor?: string } }>,
    reply: FastifyReply,
  ) => {
    const validStatuses = ['open', 'investigating', 'confirmed', 'dismissed', 'resolved'];
    const newStatus = req.body?.status?.toLowerCase();
    const actor = req.body?.actor || 'Analyst';

    if (!newStatus || !validStatuses.includes(newStatus)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_STATUS', message: `Status must be one of: ${validStatuses.join(', ')}` },
      });
    }

    const c = await caseStore.getCaseById(req.params.id);
    if (!c) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Case not found' } });
    }

    const auditTrail = [...(c.audit_trail || [])];
    auditTrail.unshift({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      actor,
      action: `Status → ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`,
      details: req.body?.notes
        ? `Note: "${req.body.notes}"`
        : `Case moved from ${c.status} to ${newStatus}`,
    });

    const updated = await caseStore.updateCase(req.params.id, {
      status: newStatus as any,
      audit_trail: auditTrail,
      resolved_at: newStatus === 'resolved' ? new Date().toISOString() : undefined,
    });

    return reply.send({ success: true, data: updated });
  });

  // ── PATCH /api/v1/cases/:id ──────────────────────────────────
  app.patch('/:id', async (
    req: FastifyRequest<{ Params: { id: string }; Body: Record<string, any> }>,
    reply: FastifyReply,
  ) => {
    const updates = req.body || {};
    const updated = await caseStore.updateCase(req.params.id, {
      ...updates,
      updated_at: new Date().toISOString(),
    });

    if (!updated) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Case not found' } });
    }
    return reply.send({ success: true, data: updated });
  });

  // ── DELETE /api/v1/cases/:id ─────────────────────────────────
  app.delete('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const success = await caseStore.deleteCase(req.params.id);
    if (!success) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Case not found or already removed' } });
    }
    return reply.send({ success: true, data: { id: req.params.id, message: 'Case removed from queue' } });
  });

  // ── POST /api/v1/cases/:id/unescalate ───────────────────────
  app.post('/:id/unescalate', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const success = await caseStore.deleteCase(req.params.id);
    if (!success) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Case not found or already removed' } });
    }
    return reply.send({ success: true, data: { id: req.params.id, message: 'Case unescalated and removed' } });
  });
}
