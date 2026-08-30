/**
 * caseStore.ts — Supabase-backed persistent case store.
 *
 * All case mutations (create, update, mitigations, checklist, notes, delete)
 * are written to and read from the `risk_cases` table in Supabase via the
 * existing pg Pool. Falls back to the in-memory dataStore when the DB is
 * unavailable, so the app is always functional.
 *
 * Column mapping (DB ↔ App):
 *  DB column          App field
 *  ─────────────────  ─────────────────────────
 *  id                 id (UUID)
 *  external_id        app-level string id (e.g. "case_ring_1")
 *  title              title
 *  case_type          derived from typology_tags
 *  description        ai_summary
 *  status             status
 *  severity           severity
 *  risk_score         risk_score
 *  assigned_to_email  assigned_to
 *  signals            signals (JSONB)
 *  typology_tags      typology_tags (JSONB)
 *  notes              notes
 *  ai_summary         ai_summary
 *  action_checklist   action_checklist (JSONB)
 *  audit_trail        audit_trail (JSONB)
 *  mitigations        mitigations (JSONB)
 *  created_at         created_at
 *  updated_at         updated_at
 */

import { pool } from './database.js';
import { dataStore, type RiskCase } from './dataService.js';
import { logger } from './logger.js';

// ── DB → App row mapper ─────────────────────────────────────────
function rowToCase(row: any): RiskCase {
  return {
    id: row.external_id || row.id,
    _db_uuid: row.id,
    title: row.title,
    merchant_id:
      row.merchant_id ||
      row.evidence?.merchant_id ||
      (typeof row.evidence === 'string' ? (() => { try { return JSON.parse(row.evidence)?.merchant_id; } catch { return undefined; } })() : undefined) ||
      'm_default',
    customer_id: row.customer_id,
    status: row.status,
    severity: row.severity,
    risk_score: parseFloat(row.risk_score ?? 0.5),
    assigned_to: row.assigned_to_email || undefined,
    signals: row.signals ?? [],
    typology_tags: row.typology_tags ?? [],
    notes: row.notes || '',
    ai_summary: row.ai_summary || '',
    action_checklist: row.action_checklist ?? [],
    audit_trail: row.audit_trail ?? [],
    mitigations: row.mitigations ?? {
      device_blocked: false,
      ip_throttled: false,
      customer_held: false,
      merchant_notified: false,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  } as any;
}

// ── Case type resolver ──────────────────────────────────────────
function deriveCaseType(tags?: string[]): string {
  if (!tags || tags.length === 0) return 'other';
  const joined = tags.join(' ').toLowerCase();
  if (joined.includes('abuse') || joined.includes('ring')) return 'abuse_ring';
  if (joined.includes('fraud')) return 'fraud';
  if (joined.includes('chargeback')) return 'chargeback';
  if (joined.includes('return')) return 'return_abuse';
  return 'other';
}

// ── DB availability check ───────────────────────────────────────
let dbOk: boolean | null = null;
async function isDbAvailable(): Promise<boolean> {
  if (dbOk !== null) return dbOk;
  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return dbOk;
}

// ── Seed synthesized ring cases into DB (idempotent) ──────────────────────────
export async function seedRingCasesToDb(): Promise<void> {
  if (!(await isDbAvailable())) return;

  try {
    const inMemoryCases = dataStore.cases;
    for (const c of inMemoryCases) {
      // Use external_id to deduplicate
      const existing = await pool.query(
        'SELECT id FROM risk_cases WHERE external_id = $1 LIMIT 1',
        [c.id],
      );

      if (existing.rows.length > 0) continue; // Already in DB

      const caseType = deriveCaseType(c.typology_tags);
      const evidenceObj = { merchant_id: c.merchant_id, signals: c.signals };
      await pool.query(
        `INSERT INTO risk_cases
           (external_id, title, case_type, description, status, severity,
            risk_score, assigned_to_email, signals, typology_tags, notes,
            ai_summary, action_checklist, audit_trail, mitigations, entity_count, evidence, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (external_id) DO NOTHING`,
        [
          c.id,
          c.title,
          caseType,
          c.ai_summary || c.notes || '',
          c.status,
          c.severity,
          c.risk_score,
          c.assigned_to || null,
          JSON.stringify(c.signals ?? []),
          JSON.stringify(c.typology_tags ?? []),
          c.notes || '',
          c.ai_summary || '',
          JSON.stringify(c.action_checklist ?? []),
          JSON.stringify(c.audit_trail ?? []),
          JSON.stringify(c.mitigations ?? { device_blocked: false, ip_throttled: false, customer_held: false, merchant_notified: false }),
          (c.signals?.length ?? 0),
          JSON.stringify(evidenceObj),
          c.created_at,
          c.updated_at,
        ],
      );
    }
    logger.info(`✅ Seeded ${inMemoryCases.length} ring cases to Supabase`);
  } catch (err) {
    logger.error({ err }, 'Failed to seed ring cases to DB — falling back to in-memory');
    dbOk = false;
  }
}

// ── Public API ──────────────────────────────────────────────────

export async function getAllCases(status?: string, merchantId?: string): Promise<RiskCase[]> {
  if (!(await isDbAvailable())) {
    let cases = dataStore.cases;
    if (merchantId && merchantId !== 'm_demo_testbed') {
      cases = cases.filter(c => c.merchant_id === merchantId);
    }
    return status && status !== 'All'
      ? cases.filter(c => c.status.toLowerCase() === status.toLowerCase())
      : cases;
  }

  try {
    let query = `SELECT * FROM risk_cases WHERE status != 'dismissed'`;
    const params: any[] = [];

    if (merchantId) {
      params.push(merchantId);
      query += ` AND (evidence->>'merchant_id' = $${params.length} OR merchant_id::text = $${params.length})`;
    }

    if (status && status !== 'All') {
      params.push(status.toLowerCase());
      query += ` AND LOWER(status) = $${params.length}`;
    }

    query += ' ORDER BY risk_score DESC, created_at DESC';
    const res = await pool.query(query, params);
    return res.rows.map(rowToCase);
  } catch (err) {
    logger.warn({ err }, 'DB getAllCases failed — falling back to memory');
    let cases = dataStore.cases;
    if (merchantId && merchantId !== 'm_demo_testbed') {
      cases = cases.filter(c => c.merchant_id === merchantId);
    }
    return cases;
  }
}

export async function getCaseById(id: string, merchantId?: string): Promise<RiskCase | null> {
  if (!(await isDbAvailable())) {
    const c = dataStore.cases.find(c => c.id === id) ?? null;
    if (c && merchantId && merchantId !== 'm_demo_testbed' && c.merchant_id && c.merchant_id !== merchantId) {
      return null;
    }
    return c;
  }

  try {
    let query = 'SELECT * FROM risk_cases WHERE (external_id = $1 OR id::text = $1)';
    const params: any[] = [id];
    if (merchantId && merchantId !== 'm_demo_testbed') {
      params.push(merchantId);
      query += ` AND (evidence->>'merchant_id' = $2 OR merchant_id::text = $2)`;
    }
    query += ' LIMIT 1';

    const res = await pool.query(query, params);
    if (res.rows.length === 0) return null;
    return rowToCase(res.rows[0]);
  } catch (err) {
    logger.warn({ err }, 'DB getCaseById failed — falling back to memory');
    return dataStore.cases.find(c => c.id === id) ?? null;
  }
}

export async function createCase(c: RiskCase): Promise<RiskCase> {
  // Always sync to in-memory store
  dataStore.addCase(c);

  if (!(await isDbAvailable())) return c;

  try {
    const caseType = deriveCaseType(c.typology_tags);
    const evidenceObj = { merchant_id: c.merchant_id, signals: c.signals };
    const res = await pool.query(
      `INSERT INTO risk_cases
         (external_id, title, case_type, description, status, severity,
          risk_score, assigned_to_email, signals, typology_tags, notes,
          ai_summary, action_checklist, audit_trail, mitigations, entity_count, evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (external_id) DO UPDATE SET
         title = EXCLUDED.title, status = EXCLUDED.status,
         severity = EXCLUDED.severity, risk_score = EXCLUDED.risk_score,
         signals = EXCLUDED.signals, typology_tags = EXCLUDED.typology_tags,
         mitigations = EXCLUDED.mitigations, evidence = EXCLUDED.evidence, updated_at = NOW()
       RETURNING *`,
      [
        c.id,
        c.title,
        caseType,
        c.ai_summary || c.notes || '',
        c.status,
        c.severity,
        c.risk_score,
        c.assigned_to || null,
        JSON.stringify(c.signals ?? []),
        JSON.stringify(c.typology_tags ?? []),
        c.notes || '',
        c.ai_summary || '',
        JSON.stringify(c.action_checklist ?? []),
        JSON.stringify(c.audit_trail ?? []),
        JSON.stringify(c.mitigations ?? { device_blocked: false, ip_throttled: false, customer_held: false, merchant_notified: false }),
        (c.signals?.length ?? 0),
        JSON.stringify(evidenceObj),
      ],
    );
    if (res.rows.length > 0) return rowToCase(res.rows[0]);
    return c;
  } catch (err) {
    logger.error({ err }, 'Failed to insert case to Supabase');
    return c;
  }
}

export async function updateCase(id: string, updates: Partial<RiskCase>): Promise<RiskCase | null> {
  // Always update in-memory
  const memResult = dataStore.updateCase(id, updates);

  if (!(await isDbAvailable())) return memResult;

  try {
    const setClauses: string[] = [];
    const params: any[] = [];
    let i = 1;

    const addField = (col: string, val: any) => {
      setClauses.push(`${col} = $${i++}`);
      params.push(val);
    };

    if (updates.title !== undefined) addField('title', updates.title);
    if (updates.status !== undefined) addField('status', updates.status);
    if (updates.severity !== undefined) addField('severity', updates.severity);
    if (updates.risk_score !== undefined) addField('risk_score', updates.risk_score);
    if (updates.assigned_to !== undefined) addField('assigned_to_email', updates.assigned_to);
    if (updates.notes !== undefined) addField('notes', updates.notes);
    if (updates.ai_summary !== undefined) addField('ai_summary', updates.ai_summary);
    if (updates.signals !== undefined) addField('signals', JSON.stringify(updates.signals));
    if (updates.typology_tags !== undefined) addField('typology_tags', JSON.stringify(updates.typology_tags));
    if (updates.action_checklist !== undefined) addField('action_checklist', JSON.stringify(updates.action_checklist));
    if (updates.audit_trail !== undefined) addField('audit_trail', JSON.stringify(updates.audit_trail));
    if (updates.mitigations !== undefined) addField('mitigations', JSON.stringify(updates.mitigations));
    if (updates.resolved_at !== undefined) addField('resolved_at', updates.resolved_at);

    setClauses.push(`updated_at = NOW()`);

    if (setClauses.length === 1) return memResult; // only updated_at, nothing to do

    params.push(id);
    const res = await pool.query(
      `UPDATE risk_cases SET ${setClauses.join(', ')}
       WHERE external_id = $${i} OR id::text = $${i}
       RETURNING *`,
      params,
    );
    return res.rows.length > 0 ? rowToCase(res.rows[0]) : memResult;
  } catch (err) {
    logger.warn({ err }, 'DB updateCase failed — in-memory fallback used');
    return memResult;
  }
}

export async function deleteCase(id: string): Promise<boolean> {
  const memResult = dataStore.deleteCase(id);

  if (!(await isDbAvailable())) return memResult;

  try {
    const res = await pool.query(
      `UPDATE risk_cases SET status = 'dismissed', updated_at = NOW()
       WHERE (external_id = $1 OR id::text = $1) AND status != 'dismissed'`,
      [id],
    );
    return (res.rowCount ?? 0) > 0;
  } catch (err) {
    logger.warn({ err }, 'DB deleteCase failed — in-memory fallback used');
    return memResult;
  }
}

export async function toggleChecklist(
  caseId: string,
  checklistId: string,
  completed: boolean,
  actor = 'Analyst',
): Promise<RiskCase | null> {
  const updated = dataStore.toggleCaseChecklist(caseId, checklistId, completed, actor);
  if (!updated) return null;
  return updateCase(caseId, {
    action_checklist: updated.action_checklist,
    audit_trail: updated.audit_trail,
  }).then(r => r ?? updated);
}

export async function toggleMitigation(
  caseId: string,
  mitigationType: string,
  active: boolean,
  actor = 'Analyst',
): Promise<RiskCase | null> {
  const updated = dataStore.toggleCaseMitigation(caseId, mitigationType, active, actor);
  if (!updated) return null;
  return updateCase(caseId, {
    mitigations: updated.mitigations,
    audit_trail: updated.audit_trail,
    action_checklist: updated.action_checklist,
  }).then(r => r ?? updated);
}

export async function addNote(
  caseId: string,
  actor: string,
  note: string,
): Promise<RiskCase | null> {
  const updated = dataStore.addCaseNote(caseId, actor, note);
  if (!updated) return null;
  return updateCase(caseId, {
    notes: updated.notes,
    audit_trail: updated.audit_trail,
  }).then(r => r ?? updated);
}

export async function clearAuditTrail(caseId: string): Promise<RiskCase | null> {
  const updated = dataStore.clearCaseAuditTrail(caseId);
  if (!updated) return null;
  return updateCase(caseId, { audit_trail: [] }).then(r => r ?? updated);
}
