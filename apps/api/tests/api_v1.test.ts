import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';

describe('API V1 Integration Endpoints', () => {
  it('GET /api/v1/analytics/summary returns real dashboard metrics', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/summary?env=demo',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.total_transactions).toBeGreaterThan(0);
    expect(body.data.abuse_clusters_detected).toBeGreaterThan(0);

    await app.close();
  });

  it('GET /api/v1/transactions returns paginated transactions', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions?env=demo&page=1&page_size=10',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeLessThanOrEqual(10);
    expect(body.pagination.total_records).toBeGreaterThan(0);

    await app.close();
  });

  it('GET /api/v1/graph/clusters returns detected abuse rings', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/graph/clusters?env=demo',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    await app.close();
  });

  it('POST /api/v1/investigations/query returns grounded AI response with evidence cards', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/investigations/query',
      payload: { query: 'Why is Abuse Ring #000 high risk?' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.ai_explanation).toBeDefined();
    expect(body.data.evidence_cards.length).toBeGreaterThan(0);
    expect(body.data.model_result).toBeDefined();

    await app.close();
  }, 20000);

  it('PATCH /api/v1/cases/:id/status updates and durably persists case status', async () => {
    const app = await buildApp();

    // 1. Create a case first
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      payload: {
        cluster_id: 1,
        title: 'Status Test Case',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const createdCase = JSON.parse(createRes.body).data;

    // 2. Update status to confirmed
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/cases/${createdCase.id}/status`,
      payload: { status: 'confirmed' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('confirmed');

    // 3. Verify GET /cases/:id reflects the updated status
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/cases/${createdCase.id}`,
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.data.status).toBe('confirmed');

    await app.close();
  }, 20000);

  it('POST /api/v1/cases creates a new case from escalated ring', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      payload: {
        cluster_id: 1,
        title: 'Escalated Test Ring Case',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.title).toBe('Escalated Test Ring Case');
    expect(body.data.risk_score).toBeGreaterThan(0.5);

    await app.close();
  }, 20000);

  it('GET /api/v1/graph/clusters/:id returns full subgraph nodes and forensic evidence', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/graph/clusters/cluster_ring_0',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.graph.nodes.length).toBeGreaterThan(0);
    expect(body.data.graph.links.length).toBeGreaterThan(0);
    expect(body.data.evidence.shared_device).toBeDefined();
    expect(body.data.evidence.shared_ip).toBeDefined();
    expect(body.data.evidence.shared_pm).toBeDefined();

    await app.close();
  }, 20000);

  it('POST /api/v1/graph/rescan triggers radar recompute', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/graph/rescan',
      headers: { 'X-Safero-Environment': 'demo' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(typeof body.data.cluster_count).toBe('number');
    expect(body.data.cluster_count).toBeGreaterThanOrEqual(0);

    await app.close();
  }, 20000);

  it('DELETE /api/v1/cases/:id unescalates and removes specified case', async () => {
    const app = await buildApp();

    // 1. Create a custom case to unescalate
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      payload: {
        title: 'Temporary Case to Unescalate',
        risk_score: 0.82,
        severity: 'high',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body).data;

    // 2. DELETE /api/v1/cases/:id
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/cases/${created.id}`,
    });
    expect(deleteRes.statusCode).toBe(200);
    const deleteBody = JSON.parse(deleteRes.body);
    expect(deleteBody.success).toBe(true);

    // 3. Verify it cannot be retrieved or deleted again
    const deleteAgainRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/cases/${created.id}`,
    });
    expect(deleteAgainRes.statusCode).toBe(404);

    await app.close();
  }, 20000);

  it('POST /api/v1/cases supports rich escalation with tags, notes, checklist, and mitigations', async () => {
    const app = await buildApp();

    // 1. Create a rich case with typology tags, notes, and mitigations
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      payload: {
        title: 'Syndicate Burst Escalation',
        risk_score: 0.94,
        severity: 'critical',
        assigned_to: 'lead_investigator@safero.internal',
        typology_tags: ['#CardTesting', '#HighVelocity'],
        notes: 'Observed 12 velocity spikes on shared BIN.',
        mitigations: {
          device_blocked: true,
          customer_held: true,
        },
      },
    });

    expect(createRes.statusCode).toBe(201);
    const caseData = JSON.parse(createRes.body).data;
    expect(caseData.typology_tags).toContain('#CardTesting');
    expect(caseData.notes).toBe('Observed 12 velocity spikes on shared BIN.');
    expect(caseData.mitigations.device_blocked).toBe(true);
    expect(caseData.action_checklist.length).toBeGreaterThan(0);
    expect(caseData.audit_trail.length).toBeGreaterThan(0);

    const checklistId = caseData.action_checklist[0].id;

    // 2. Toggle checklist item
    const chkRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/cases/${caseData.id}/checklist/${checklistId}`,
      payload: { completed: true, actor: 'test_analyst' },
    });
    expect(chkRes.statusCode).toBe(200);
    const chkBody = JSON.parse(chkRes.body).data;
    expect(chkBody.action_checklist.find((c: any) => c.id === checklistId).completed).toBe(true);

    // 3. Toggle mitigation
    const mitRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseData.id}/mitigations`,
      payload: { mitigation_type: 'ip_throttled', active: true, actor: 'test_analyst' },
    });
    expect(mitRes.statusCode).toBe(200);
    const mitBody = JSON.parse(mitRes.body).data;
    expect(mitBody.mitigations.ip_throttled).toBe(true);

    // 4. Add analyst note
    const noteRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseData.id}/notes`,
      payload: { note: 'Confirmed with issuing bank; cardholder reported fraud.', actor: 'test_analyst' },
    });
    expect(noteRes.statusCode).toBe(200);
    const noteBody = JSON.parse(noteRes.body).data;
    expect(noteBody.audit_trail[0].details).toBe('Confirmed with issuing bank; cardholder reported fraud.');

    // 5. Clear audit trail
    const clearRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/cases/${caseData.id}/audit`,
    });
    expect(clearRes.statusCode).toBe(200);
    const clearBody = JSON.parse(clearRes.body).data;
    expect(clearBody.audit_trail.length).toBe(0);

    // Cleanup
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/cases/${caseData.id}`,
    });

    await app.close();
  });
});
