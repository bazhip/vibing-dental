// @vitest-environment node
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const container = process.env.PIMS_TEST_CONTAINER;
const owner = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
const outsider = '33333333-3333-4333-8333-333333333333';
const practice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherPractice = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const request = '44444444-4444-4444-8444-444444444444';
const chunk = '55555555-5555-4555-8555-555555555555';
const nextRequest = '66666666-6666-4666-8666-666666666666';
const group = '77777777-7777-4777-8777-777777777777';
const scope = { requested_date: '2026-11-01', timezone: 'America/New_York', window_start: '2026-11-01T04:00:00Z', window_end: '2026-11-02T05:00:00Z' };
const identity = { provider: 'ezyvet', origin: 'https://clinic.ezyvet.com', tenant_id: 'clinic-1', connection_revision: 2 };
const connectionInput = { practice_id: practice, provider: identity.provider, origin: identity.origin, tenant_id: identity.tenant_id };
const args = ['exec', '-i', container ?? '', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'pims_test'];
function sql(statement: string): string {
  return execFileSync('docker', args, { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
function userSql(actor: string, statement: string): string {
  return `begin; set local role authenticated; set local request.jwt.claim.sub = '${actor}'; ${statement}; commit;`;
}
function callStatement(name: string, payload: unknown): string {
  return `select public.${name}('${JSON.stringify(payload).replaceAll("'", "''")}'::jsonb)`;
}
function rpc(name: string, payload: unknown, actor = owner): any {
  return JSON.parse(sql(userSql(actor, callStatement(name, payload))));
}
function asyncSql(statement: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args);
    let output = '', error = '';
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { error += data; });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
    child.stdin.end(statement);
  });
}
let connection: any;
function start(requestId = request, actor = member): any {
  return rpc('pims_start_sync', { connection_id: connection.id, request_id: requestId, scope }, actor);
}
function item(overrides: Record<string, unknown> = {}) {
  return { appointment_id: 'appointment-1', patient_id: 'patient-1', clinician_id: 'vet-1', encounter_id: null, starts_at: '2026-11-01T15:00:00Z', ends_at: '2026-11-01T15:30:00Z', status: 'active', expected_version: 0, patient_link_version: 1, clinician_link_version: 1, ...overrides };
}
function submission(run: any, overrides: Record<string, unknown> = {}) {
  return { run_id: run.id, generation: run.generation, request_id: chunk, captured_at: new Date().toISOString(), identity, scope, items: [item()], ...overrides };
}
function links() {
  rpc('pims_confirm_patient', { connection_id: connection.id, patient_id: 'patient-1', patient_key: group });
  rpc('pims_link_clinician', { connection_id: connection.id, clinician_id: 'vet-1', user_id: member });
}

describe.skipIf(!container)('PIMS foundation on isolated PostgreSQL', () => {
  beforeAll(() => {
    if (!container?.startsWith('toothops-pims-')) throw new Error('Use a disposable toothops-pims-* container');
    sql(readFileSync('scripts/pims/bootstrap.sql', 'utf8'));
    const migration = readFileSync('supabase/migrations/20261129_pims_sync_foundation.sql', 'utf8');
    sql(migration);
    sql(migration);
    const reviewPath = 'supabase/migrations/20261130_pims_reconciliation.sql';
    if (existsSync(reviewPath)) {
      sql(readFileSync(reviewPath, 'utf8'));
      sql(readFileSync(reviewPath, 'utf8'));
    }
    const draftPath = 'supabase/migrations/20261201_pims_transfer_drafts.sql';
    if (existsSync(draftPath)) {
      sql(readFileSync(draftPath, 'utf8'));
      sql(readFileSync(draftPath, 'utf8'));
    }
  });
  beforeEach(() => {
    sql(`truncate auth.users cascade;
      insert into auth.users values ('${owner}'), ('${member}'), ('${outsider}');
      insert into public.practices(id, owner, pims_send_enabled) values ('${practice}', '${owner}', true), ('${otherPractice}', '${outsider}', true);
      insert into public.practice_members values ('${practice}','${owner}','owner'), ('${practice}','${member}','member'), ('${otherPractice}','${outsider}','owner');`);
    connection = rpc('pims_configure_connection', connectionInput);
    connection = rpc('pims_verify_connection', { connection_id: connection.id, expected_revision: 1, provider: identity.provider, origin: identity.origin, tenant_id: identity.tenant_id, observed_at: new Date().toISOString() });
  });

  describe('persisted clinical drafts', () => {
    const chartId = '88888888-8888-4888-8888-888888888888';
    const draftId = '99999999-9999-4999-8999-999999999999';
    const context = (actor = member) => rpc('pims_draft_context', { chart_id: chartId }, actor);
    const save = (changes: Record<string, unknown> = {}, actor = member) => rpc('pims_draft_write', {
      action: 'save', chart_id: chartId, draft_id: draftId, request_id: request,
      expected_version: 0, kind: 'history', language: 'en', body: 'Tooth 108: 4.5 mm',
      source_hash: context().source.hash, ...changes,
    }, actor);
    const review = () => rpc('pims_draft_write', { action: 'review', chart_id: chartId, draft_id: draftId,
      request_id: chunk, expected_version: 1 }, member);
    const exportDraft = (version = 2, actor = member) => rpc('pims_draft_export', {
      chart_id: chartId, draft_id: draftId, expected_version: version,
    }, actor);
    beforeEach(() => {
      sql(`insert into public.charts(id,created_by,practice_id,patient_name,patient_number,data)
        values('${chartId}','${member}','${practice}','Milo','P-1','{"findings":"4.5 mm"}')`);
    });
    it('persists literal text and requires review before export without marking a PIMS send', () => {
      const created = save();
      expect(created).toMatchObject({ id: draftId, version: 1, reviewed_version: null, body: 'Tooth 108: 4.5 mm' });
      expect(context().drafts).toHaveLength(1);
      expect(() => exportDraft(1)).toThrow(/pims_unreviewed/);
      expect(review()).toMatchObject({ version: 2, reviewed_version: 2, reviewed_by: member });
      expect(exportDraft()).toMatchObject({ body: created.body, kind: 'history', source_hash: created.source_hash });
      expect(sql('select count(*) from public.pims_draft_actions')).toBe('2');
    });
    it('binds retries to their actor and exact payload and rejects stale edits', () => {
      expect(save()).toEqual(save());
      expect(() => save({ body: 'changed' })).toThrow(/pims_idempotency/);
      expect(() => save({}, owner)).toThrow(/pims_idempotency/);
      expect(() => save({ request_id: nextRequest })).toThrow(/pims_conflict/);
      expect(() => save({ request_id: nextRequest, kind: 'radiology', expected_version: 1 })).toThrow(/pims_conflict/);
    });
    it.each(['data', 'patient_number', 'updated_at'])('invalidates approval when %s changes', (field) => {
      save(); review();
      sql(`update public.charts set ${field}=${field === 'data' ? `'{}'::jsonb` : field === 'updated_at' ? `updated_at + interval '1 second'` : `'P-2'`} where id='${chartId}'`);
      expect(() => exportDraft()).toThrow(/pims_stale/);
      expect(() => rpc('pims_draft_write', { action: 'review', chart_id: chartId, draft_id: draftId,
        request_id: nextRequest, expected_version: 2 }, member)).toThrow(/pims_stale/);
      expect(save({ request_id: nextRequest, expected_version: 2 }).reviewed_version).toBeNull();
    });
    it('clears approval on edits, including language changes', () => {
      save(); review();
      const edited = save({ request_id: nextRequest, expected_version: 2, language: 'fr', body: '108 : 4,5 mm' });
      expect(edited).toMatchObject({ version: 3, reviewed_version: null, reviewed_by: null });
      expect(() => exportDraft(3)).toThrow(/pims_unreviewed/);
    });
    it('does not replay a review as current after its clinical source changes', () => {
      save(); review();
      sql(`update public.charts set data='{"findings":"changed"}' where id='${chartId}'`);
      expect(() => review()).toThrow(/pims_stale/);
    });
    it('serializes simultaneous edits so only one expected version wins', async () => {
      save();
      const payload = { action: 'save', chart_id: chartId, draft_id: draftId, expected_version: 1,
        kind: 'history', language: 'en', body: 'Concurrent findings', source_hash: context().source.hash };
      const attempts = await Promise.allSettled([chunk, nextRequest].map((request_id) => asyncSql(userSql(member,
        callStatement('pims_draft_write', { ...payload, request_id })))));
      expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect(context().drafts[0].version).toBe(2);
    });
    it('blocks outsiders, removed members and private-to-practice leakage', () => {
      save(); review();
      expect(() => context(outsider)).toThrow(/pims_forbidden/);
      expect(() => exportDraft(2, outsider)).toThrow(/pims_forbidden/);
      sql(`delete from public.practice_members where user_id='${member}'`);
      expect(() => context()).toThrow(/pims_forbidden/);
      expect(() => exportDraft()).toThrow(/pims_forbidden/);
      expect(sql(userSql(member, 'select count(*) from public.pims_drafts'))).toBe('0');
      sql(`update public.charts set practice_id=null where id='${chartId}'`);
      expect(() => context(owner)).toThrow(/pims_forbidden/);
      expect(sql(userSql(owner, 'select count(*) from public.pims_drafts'))).toBe('0');
    });
    it('hides saved clinical bodies after chart moves to another practice, including replay receipts', () => {
      save();
      sql(`update public.charts set practice_id='${otherPractice}' where id='${chartId}'`);
      expect(() => context()).toThrow(/pims_forbidden/);
      expect(sql(userSql(member, 'select count(*) from public.pims_draft_actions'))).toBe('0');
      expect(context(outsider).drafts).toEqual([]);
    });
    it.each([{ body: '' }, { body: ' '.repeat(3) }, { body: 'x'.repeat(60001) }, { language: 'xx' }, { kind: 'diagnosis' }, { source_hash: 'fake' }])('rejects invalid drafts %j', (changes) => {
      expect(() => save(changes)).toThrow(/pims_invalid|pims_stale/);
    });
  });

  it('requires current owner membership to configure and verify', () => {
    expect(() => rpc('pims_configure_connection', connectionInput, member)).toThrow(/pims_forbidden/);
    expect(() => rpc('pims_verify_connection', { connection_id: connection.id, expected_revision: 2, provider: identity.provider, origin: identity.origin, tenant_id: identity.tenant_id, observed_at: new Date().toISOString() }, member)).toThrow(/pims_forbidden/);
    sql(`delete from public.practice_members where user_id = '${owner}'`);
    expect(() => rpc('pims_configure_connection', connectionInput)).toThrow(/pims_forbidden/);
  });
  it('has RLS on every integration table, denies direct writes and anonymous RPCs', () => {
    const tables = sql("select tablename from pg_tables where schemaname='public' and tablename like 'pims_%'").split('\n');
    for (const table of tables) {
      expect(sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`)).toBe('t');
      expect(sql(userSql(outsider, `select count(*) from public.${table}`))).toBe('0');
      expect(() => sql(userSql(member, `delete from public.${table}`))).toThrow(/permission denied/);
    }
    expect(() => sql(`set role anon; ${callStatement('pims_start_sync', {})}`)).toThrow(/permission denied/);
    expect(() => sql(`set role service_role; ${callStatement('pims_start_sync', {})}`)).toThrow(/permission denied/);
  });
  it('rejects mixed-practice foreign keys even for privileged insertion', () => {
    expect(() => sql(`insert into public.pims_patient_links (practice_id,connection_id,patient_id,patient_key,created_by) values ('${otherPractice}','${connection.id}','bad','${group}','${owner}')`)).toThrow(/foreign key/);
  });
  it.each(['http://clinic.ezyvet.com', 'https://ezyvet.com.attacker.test', 'https://clinic.ezyvet.com/path', 'https://user:pass@clinic.ezyvet.com', 'https://clinic.ezyvet.com:8443'])('rejects unsafe origin %s', (origin) => {
    expect(() => rpc('pims_configure_connection', { ...connectionInput, origin })).toThrow(/pims_invalid/);
  });
  it('does not treat owner configuration as verified clinic evidence', () => {
    const unverified = rpc('pims_configure_connection', { ...connectionInput, tenant_id: 'clinic-2' });
    expect(unverified.state).toBe('unverified');
    expect(() => rpc('pims_start_sync', { connection_id: unverified.id, request_id: request, scope })).toThrow(/pims_unverified/);
    expect(() => rpc('pims_verify_connection', { connection_id: unverified.id, expected_revision: 1, provider: identity.provider, origin: identity.origin, tenant_id: identity.tenant_id, observed_at: new Date().toISOString() })).toThrow(/pims_identity/);
  });
  it('accepts the 25-hour DST day, binds start replay and does not renew the lease', () => {
    const first = start();
    expect(start()).toEqual(first);
    expect(Date.parse(first.expires_at) - Date.parse(first.started_at)).toBe(300000);
    expect(() => rpc('pims_start_sync', { connection_id: connection.id, request_id: request, scope: { ...scope, timezone: 'UTC' } }, member)).toThrow(/pims_invalid|pims_idempotency/);
    expect(() => start(request, owner)).toThrow(/pims_idempotency/);
    expect(() => start(nextRequest)).toThrow(/pims_busy/);
  });
  it.each([
    { timezone: 'Not/AZone' }, { window_end: '2026-11-02T04:00:00Z' },
    { requested_date: '2026-11-02' }, { window_start: '2026-11-01T05:00:00Z' },
  ])('rejects mismatched local-day scopes %j', (changes) => {
    expect(() => rpc('pims_start_sync', { connection_id: connection.id, request_id: request, scope: { ...scope, ...changes } })).toThrow(/pims_invalid/);
  });
  it('rejects a former member even when retrying a successful start', () => {
    start();
    sql(`delete from public.practice_members where user_id='${member}'`);
    expect(() => start()).toThrow(/pims_forbidden/);
    expect(sql(userSql(member, 'select count(*) from public.pims_sync_runs'))).toBe('0');
  });
  it('keeps clinician and patient identity links owner-managed and immutable', () => {
    expect(() => rpc('pims_confirm_patient', { connection_id: connection.id, patient_id: 'patient-1', patient_key: group }, member)).toThrow(/pims_forbidden/);
    expect(() => rpc('pims_link_clinician', { connection_id: connection.id, clinician_id: 'vet-1', user_id: outsider })).toThrow(/pims_forbidden/);
    links();
    expect(() => rpc('pims_confirm_patient', { connection_id: connection.id, patient_id: 'patient-1', patient_key: request })).toThrow(/pims_conflict/);
  });
  it('applies a linked appointment once and persists retry outcomes', () => {
    links();
    const run = start(), payload = submission(run);
    const result = rpc('pims_submit_sync', payload, member);
    expect(result.outcomes[0]).toMatchObject({ appointment_id: 'appointment-1', outcome: 'applied', version: 1 });
    expect(rpc('pims_submit_sync', payload, member)).toEqual(result);
    expect(sql('select count(*) from public.pims_visits')).toBe('1');
    expect(() => rpc('pims_submit_sync', { ...payload, items: [item({ encounter_id: 'changed' })] }, member)).toThrow(/pims_idempotency/);
  });
  it('rejects pre-start captures, changed tenants and wrong generations', () => {
    links();
    const run = start();
    for (const overrides of [{ captured_at: '2020-01-01T00:00:00Z' }, { generation: run.generation + 1 }, { identity: { ...identity, tenant_id: 'other' } }, { scope: { ...scope, timezone: 'UTC' } }]) {
      expect(() => rpc('pims_submit_sync', submission(run, overrides), member)).toThrow(/pims_stale|pims_identity|pims_invalid/);
    }
    expect(sql('select count(*) from public.pims_visits')).toBe('0');
  });
  it('expires a run without resuming it after a new generation starts', () => {
    const run = start();
    sql(`update public.pims_sync_runs set expires_at=clock_timestamp()-interval '1 second'`);
    const newer = start(nextRequest);
    expect(newer.generation).toBe(run.generation + 1);
    expect(() => rpc('pims_submit_sync', submission(run), member)).toThrow(/pims_stale/);
  });
  it('invalidates captures after owner changes the connection', () => {
    const run = start();
    rpc('pims_configure_connection', { ...connectionInput, connection_id: connection.id, expected_revision: 2, tenant_id: 'clinic-new' });
    expect(() => rpc('pims_submit_sync', submission(run), member)).toThrow(/pims_stale|pims_unverified/);
  });
  it('does not fabricate links or clinical authorship for unmapped identities', () => {
    const result = rpc('pims_submit_sync', submission(start()), member);
    expect(result.outcomes[0]).toMatchObject({ outcome: 'skipped', reason: 'patient_unlinked' });
    expect(sql('select count(*) from public.pims_visits')).toBe('0');
    expect(sql('select count(*) from public.pims_sync_issues')).toBe('1');
  });
  it('reports stale baselines and patient changes without replacing identity', () => {
    links();
    const run = start();
    rpc('pims_submit_sync', submission(run), member);
    const conflict = rpc('pims_submit_sync', submission(run, { request_id: nextRequest }), member);
    expect(conflict.outcomes[0]).toMatchObject({ outcome: 'conflict', reason: 'visit_version' });
    rpc('pims_confirm_patient', { connection_id: connection.id, patient_id: 'patient-2', patient_key: request });
    const changed = rpc('pims_submit_sync', submission(run, { request_id: group, items: [item({ patient_id: 'patient-2', expected_version: 1 })] }), member);
    expect(changed.outcomes[0]).toMatchObject({ outcome: 'conflict', reason: 'identity_changed' });
    expect(sql('select version from public.pims_visits')).toBe('1');
  });
  it('requires the mapped clinician to remain a current member', () => {
    links();
    const run = start(request, owner);
    sql(`delete from public.practice_members where user_id='${member}'`);
    expect(rpc('pims_submit_sync', submission(run)).outcomes[0]).toMatchObject({ outcome: 'skipped', reason: 'clinician_unlinked' });
  });
  it('records unchanged observations without changing the visit version', () => {
    links();
    const run = start();
    rpc('pims_submit_sync', submission(run), member);
    const result = rpc('pims_submit_sync', submission(run, { request_id: nextRequest, items: [item({ expected_version: 1 })] }), member);
    expect(result.outcomes[0]).toMatchObject({ outcome: 'unchanged', version: 1 });
  });
  it('rejects oversized and malformed batches atomically', () => {
    links();
    const run = start();
    for (const items of [Array.from({ length: 101 }, (_, index) => item({ appointment_id: `a-${index}` })), [item(), item({ appointment_id: 'bad', patient_id: '' })], [item({ raw_html: 'never store' })], [item(), item()]]) {
      expect(() => rpc('pims_submit_sync', submission(run, { items }), member)).toThrow(/pims_invalid/);
      expect(sql('select count(*) from public.pims_visits')).toBe('0');
    }
  });
  it('does not reconcile cancellations or empty captures in the foundation increment', () => {
    links();
    const run = start();
    rpc('pims_submit_sync', submission(run), member);
    const cancelled = rpc('pims_submit_sync', submission(run, { request_id: nextRequest, items: [item({ status: 'cancelled', expected_version: 1 })] }), member);
    expect(cancelled.outcomes[0]).toMatchObject({ outcome: 'skipped', reason: 'status_requires_review' });
    rpc('pims_submit_sync', submission(run, { request_id: group, items: [] }), member);
    const finished = rpc('pims_finish_sync', { run_id: run.id, generation: run.generation, state: 'completed', completeness: 'partial' }, member);
    expect(finished).toMatchObject({ state: 'completed', completeness: 'partial' });
    expect(sql('select count(*) from public.pims_visits')).toBe('1');
    expect(rpc('pims_finish_sync', { run_id: run.id, generation: run.generation, state: 'completed', completeness: 'partial' }, member)).toEqual(finished);
    expect(() => rpc('pims_finish_sync', { run_id: run.id, generation: run.generation, state: 'completed', completeness: 'complete' }, member)).toThrow(/pims_idempotency/);
  });
  it('serializes concurrent starts so exactly one obtains a lease', async () => {
    const payload = { connection_id: connection.id, request_id: request, scope };
    const results = await Promise.allSettled([
      asyncSql(userSql(member, callStatement('pims_start_sync', payload))),
      asyncSql(userSql(member, callStatement('pims_start_sync', { ...payload, request_id: nextRequest }))),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(sql("select count(*) from public.pims_sync_runs where state='capturing'")).toBe('1');
  });
  it('never reuses established patient links for a different clinic on the same origin', () => {
    links();
    expect(() => rpc('pims_configure_connection', { ...connectionInput, connection_id: connection.id, expected_revision: 2, tenant_id: 'different-clinic' })).toThrow(/pims_conflict/);
    expect(sql('select tenant_id from public.pims_connections')).toBe('clinic-1');
  });
  it('does not allow a patient group from another practice', () => {
    links();
    const other = rpc('pims_configure_connection', { ...connectionInput, practice_id: otherPractice }, outsider);
    expect(() => rpc('pims_confirm_patient', { connection_id: other.id, patient_id: 'patient-x', patient_key: group }, outsider)).toThrow(/pims_forbidden/);
  });
  it('updates schedule metadata only with a current version and rechecks the feature gate', () => {
    links();
    const run = start();
    rpc('pims_submit_sync', submission(run), member);
    const updated = rpc('pims_submit_sync', submission(run, { request_id: nextRequest, items: [item({ expected_version: 1, starts_at: '2026-11-01T16:00:00Z', ends_at: '2026-11-01T16:30:00Z' })] }), member);
    expect(updated.outcomes[0]).toMatchObject({ outcome: 'applied', version: 2 });
    sql(`update public.practices set pims_send_enabled=false where id='${practice}'`);
    expect(() => rpc('pims_submit_sync', submission(run), member)).toThrow(/pims_disabled/);
  });
  it('reads bounded baseline versions only for the current run actor and lease', () => {
    links();
    const run = start();
    const input = { run_id: run.id, generation: run.generation, collection: 'patient_links' };
    expect(rpc('pims_sync_baseline', input, member)).toEqual({ rows: [{ external_id: 'patient-1', version: 1 }], next_cursor: null });
    expect(() => rpc('pims_sync_baseline', input, owner)).toThrow(/pims_forbidden/);
    sql(`update public.pims_sync_runs set expires_at=clock_timestamp()-interval '1 second'`);
    expect(() => rpc('pims_sync_baseline', input, member)).toThrow(/pims_stale/);
  });
  it('retains distinct conflicting proposals instead of silently deduplicating them', () => {
    links();
    const run = start();
    rpc('pims_submit_sync', submission(run), member);
    rpc('pims_submit_sync', submission(run, { request_id: nextRequest, items: [item({ encounter_id: 'encounter-2', expected_version: 1 })] }), member);
    rpc('pims_submit_sync', submission(run, { request_id: group, items: [item({ encounter_id: 'encounter-3', expected_version: 1 })] }), member);
    expect(sql("select count(*) from public.pims_sync_issues where reason='identity_changed'")).toBe('2');
  });
  it('pages more than 10000 historical visits without permanently blocking daily sync', () => {
    links();
    const run = start();
    rpc('pims_submit_sync', submission(run), member);
    sql(`insert into public.pims_visits(practice_id,connection_id,appointment_id,patient_link_id,patient_link_version,clinician_link_id,clinician_link_version,starts_at,ends_at,source_hash,last_seen_run_id)
      select practice_id,connection_id,'old-'||sequence,patient_link_id,patient_link_version,clinician_link_id,clinician_link_version,starts_at-interval '1 year',ends_at-interval '1 year',source_hash,last_seen_run_id
      from public.pims_visits cross join generate_series(1,10000) sequence`);
    rpc('pims_finish_sync', { run_id: run.id, generation: run.generation, state: 'completed', completeness: 'partial' }, member);
    const next = start(nextRequest);
    let cursor: string | null = null, count = 0;
    do {
      const page = rpc('pims_sync_baseline', { run_id: next.id, generation: next.generation, collection: 'visits', ...(cursor ? { cursor } : {}) }, member);
      expect(page.rows.length).toBeLessThanOrEqual(1000);
      count += page.rows.length;
      cursor = page.next_cursor;
    } while (cursor);
    expect(count).toBe(10001);
  });
  it('enforces current-member reads even if the older shared access helper is permissive', () => {
    sql("create or replace function public.is_member_of(pid uuid) returns boolean language sql stable security definer set search_path='' as $$ select true $$");
    try {
      expect(sql(userSql(outsider, 'select count(*) from public.pims_connections'))).toBe('0');
    } finally {
      sql("create or replace function public.is_member_of(pid uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.practice_members where practice_id=pid and user_id=auth.uid()) $$");
    }
  });
  it('rolls back a chunk whose lease expires during processing', () => {
    links();
    const run = start();
    sql(`update public.pims_sync_runs set expires_at=clock_timestamp()+interval '1 second';
      create sequence public.pims_test_delay_entered;
      create function public.delay_pims_test() returns trigger language plpgsql as $$ begin perform nextval('public.pims_test_delay_entered'); perform pg_sleep(1.2); return new; end $$;
      create trigger delay_pims_test before insert on public.pims_visits for each row execute function public.delay_pims_test()`);
    try {
      expect(() => rpc('pims_submit_sync', submission(run), member)).toThrow(/pims_stale/);
      expect(sql('select count(*) from public.pims_visits')).toBe('0');
      expect(sql('select count(*) from public.pims_sync_chunks')).toBe('0');
      expect(sql('select is_called from public.pims_test_delay_entered')).toBe('t');
    } finally {
      sql('drop trigger delay_pims_test on public.pims_visits; drop function public.delay_pims_test(); drop sequence public.pims_test_delay_entered');
    }
  });

  function seededVisit() {
    links();
    const run = start();
    rpc('pims_submit_sync', submission(run), member);
    return { run, visit: JSON.parse(sql('select to_jsonb(visit) from public.pims_visits visit')) };
  }
  function archive(visit: any, changes: Record<string, unknown> = {}, actor = member) {
    return rpc('pims_review_visit', { connection_id: connection.id, visit_id: visit.id, expected_version: visit.version,
      request_id: nextRequest, action: 'archive', reason: 'Reviewed appointment', ...changes }, actor);
  }
  function seal(run: any, completeness = 'complete') {
    return rpc('pims_seal_capture', { run_id: run.id, generation: run.generation, completeness }, member);
  }
  function missingRun() {
    const seeded = seededVisit();
    rpc('pims_finish_sync', { run_id: seeded.run.id, generation: seeded.run.generation, state: 'completed', completeness: 'complete' }, member);
    const run = start(nextRequest);
    rpc('pims_submit_sync', submission(run, { request_id: group, items: [] }), member);
    seal(run);
    return { ...seeded, run };
  }
  function reconcile(run: any, visit: any, status = 'unknown', changes: Record<string, unknown> = {}) {
    return rpc('pims_reconcile_status', { run_id: run.id, generation: run.generation, request_id: request,
      captured_at: new Date().toISOString(), identity, appointment_id: visit.appointment_id,
      expected_version: visit.version, patient_link_version: 1, clinician_link_version: 1, status, ...changes }, member);
  }
  it('archives and restores metadata explicitly, with versions, actor, reason and audit', () => {
    const { visit } = seededVisit();
    const archived = archive(visit);
    expect(archived).toMatchObject({ id: visit.id, version: 2, archive_kind: 'manual', archive_reason: 'Reviewed appointment', archived_by: member });
    expect(archive(visit)).toEqual(archived);
    expect(() => archive(visit, { reason: 'Different' })).toThrow(/pims_idempotency/);
    expect(() => archive(visit, { request_id: group, action: 'restore' })).toThrow(/pims_conflict/);
    expect(archive(archived, { request_id: group, action: 'restore' })).toMatchObject({ version: 3, archived_at: null });
    expect(sql("select count(*) from public.pims_audit_events where action in ('archive','restore')")).toBe('2');
  });
  it('does not let sync restore or change manually archived visits', () => {
    const { run, visit } = seededVisit();
    archive(visit);
    const result = rpc('pims_submit_sync', submission(run, { request_id: group, items: [item({ expected_version: 2, starts_at: '2026-11-01T16:00:00Z', ends_at: '2026-11-01T16:30:00Z' })] }), member);
    expect(result.outcomes[0]).toMatchObject({ outcome: 'skipped', reason: 'archived_requires_review', version: 2 });
    expect(sql('select version from public.pims_visits')).toBe('2');
  });
  it('enforces current membership even for archive replay and denies cross-practice actions', () => {
    const { visit } = seededVisit();
    expect(() => archive(visit, {}, outsider)).toThrow(/pims_forbidden/);
    archive(visit);
    sql(`delete from public.practice_members where user_id='${member}'`);
    expect(() => archive(visit)).toThrow(/pims_forbidden/);
  });
  it('shows practice-scoped active/archive pages without deleting visits', () => {
    const { visit } = seededVisit();
    const query = { connection_id: connection.id, collection: 'active' };
    expect(rpc('pims_review_page', query, member).rows).toHaveLength(1);
    archive(visit);
    expect(rpc('pims_review_page', query, member).rows).toEqual([]);
    expect(rpc('pims_review_page', { ...query, collection: 'archived' }, member).rows[0]).toMatchObject({ id: visit.id, patient_id: 'patient-1' });
    expect(() => rpc('pims_review_page', query, outsider)).toThrow(/pims_forbidden/);
    expect(rpc('pims_review_connections', {}, outsider)).toEqual([]);
  });
  it('retains a conflict without modifying source metadata and prevents stale review', () => {
    const { run, visit } = seededVisit();
    rpc('pims_submit_sync', submission(run, { request_id: nextRequest, items: [item({ encounter_id: 'different', expected_version: 1 })] }), member);
    const issue = rpc('pims_review_page', { connection_id: connection.id, collection: 'issues' }, member).rows[0];
    const review = { connection_id: connection.id, issue_id: issue.id, expected_version: visit.version, request_id: group, action: 'accept_schedule' };
    expect(() => rpc('pims_resolve_issue', review, member)).toThrow(/pims_identity/);
    expect(rpc('pims_resolve_issue', { ...review, action: 'retain' }, member)).toMatchObject({ resolution: 'retain' });
    expect(rpc('pims_review_page', { connection_id: connection.id, collection: 'issues' }, member).rows).toEqual([]);
    expect(sql('select version from public.pims_visits')).toBe('1');
  });
  it('accepts reviewed schedule changes only against current matching identity and version', () => {
    const { run, visit } = seededVisit();
    rpc('pims_submit_sync', submission(run, { request_id: nextRequest, items: [item({ starts_at: '2026-11-01T16:00:00Z', ends_at: '2026-11-01T16:30:00Z' })] }), member);
    const issue = rpc('pims_review_page', { connection_id: connection.id, collection: 'issues' }, member).rows[0];
    const review = { connection_id: connection.id, issue_id: issue.id, expected_version: 0, request_id: group, action: 'accept_schedule' };
    expect(() => rpc('pims_resolve_issue', review, member)).toThrow(/pims_conflict/);
    expect(rpc('pims_resolve_issue', { ...review, expected_version: visit.version }, member)).toMatchObject({ resolution: 'accept_schedule', visit_version: 2 });
    expect(sql("select starts_at = '2026-11-01T16:00:00Z'::timestamptz from public.pims_visits")).toBe('t');
  });
  it('seals complete captures before offering scope-limited absent candidates', () => {
    const { run, visit } = missingRun();
    const page = rpc('pims_reconcile_candidates', { run_id: run.id, generation: run.generation }, member);
    expect(page.rows).toEqual([{ appointment_id: visit.appointment_id, version: 1, patient_link_version: 1, clinician_link_version: 1 }]);
    expect(() => rpc('pims_submit_sync', submission(run, { request_id: request }), member)).toThrow(/pims_stale/);
    expect(() => seal(run, 'partial')).toThrow(/pims_idempotency/);
  });
  it.each(['partial', 'unknown'])('does not infer absence from a %s capture', (completeness) => {
    const { run } = seededVisit();
    seal(run, completeness);
    expect(rpc('pims_reconcile_candidates', { run_id: run.id, generation: run.generation }, member).rows).toEqual([]);
  });
  it('unknown status leaves a missing visit visible and creates a review issue', () => {
    const { run, visit } = missingRun();
    expect(reconcile(run, visit)).toMatchObject({ outcome: 'skipped', reason: 'status_unknown', version: 1 });
    expect(sql('select archived_at is null from public.pims_visits')).toBe('t');
  });
  it('rejects missing-visit status evidence captured before sealing', () => {
    const { run, visit } = missingRun();
    expect(() => reconcile(run, visit, 'cancelled', { captured_at: run.started_at })).toThrow(/pims_stale/);
    expect(sql('select archived_at is null from public.pims_visits')).toBe('t');
  });
  it.each([{ patient_id: 'different' }, { clinician_id: 'different' }, { encounter_id: 'different' }, { patient_link_version: 2 }])('never archives from a mismatched cancellation %j', (identityChange) => {
    const { run, visit } = seededVisit();
    rpc('pims_submit_sync', submission(run, { request_id: group, items: [item({ expected_version: 1, status: 'cancelled', ...identityChange })] }), member);
    seal(run, 'partial');
    expect(rpc('pims_reconcile_candidates', { run_id: run.id, generation: run.generation }, member).rows).toEqual([]);
    expect(() => reconcile(run, visit, 'cancelled')).toThrow(/pims_invalid/);
    expect(sql('select archived_at is null from public.pims_visits')).toBe('t');
  });
  it('preserves the restore reason in the durable review receipt', () => {
    const { visit } = seededVisit();
    const archived = archive(visit);
    archive(archived, { request_id: group, action: 'restore', reason: 'Confirmed with clinic' });
    expect(sql(`select reason from public.pims_review_actions where request_id='${group}'`)).toBe('Confirmed with clinic');
  });
  it.each(['before_submission', 'after_candidates'])('does not override a manual restore %s with an older cancellation', (timing) => {
    const { run, visit } = seededVisit();
    let restored = visit;
    const restore = () => { restored = archive(archive(visit), { action: 'restore', request_id: chunk }); };
    if (timing === 'before_submission') restore();
    rpc('pims_submit_sync', submission(run, { request_id: group, items: [item({ expected_version: 1, status: 'cancelled' })] }), member);
    seal(run, 'partial');
    const candidates = rpc('pims_reconcile_candidates', { run_id: run.id, generation: run.generation }, member);
    if (timing === 'before_submission') expect(candidates.rows).toEqual([]);
    else { expect(candidates.rows).toHaveLength(1); restore(); }
    expect(() => reconcile(run, restored, 'cancelled')).toThrow(/pims_invalid/);
    expect(sql('select archived_at is null from public.pims_visits')).toBe('t');
  });
  it.each(['before_candidates', 'after_candidates'])('honors retained cancellation %s', (timing) => {
    const { run, visit } = seededVisit();
    rpc('pims_submit_sync', submission(run, { request_id: group, items: [item({ expected_version: 1, status: 'cancelled' })] }), member);
    seal(run, 'partial');
    const retain = () => {
      const issue = rpc('pims_review_page', { connection_id: connection.id, collection: 'issues' }, member).rows[0];
      rpc('pims_resolve_issue', { connection_id: connection.id, issue_id: issue.id, expected_version: 1, request_id: nextRequest, action: 'retain' }, member);
    };
    if (timing === 'before_candidates') retain();
    const candidates = rpc('pims_reconcile_candidates', { run_id: run.id, generation: run.generation }, member);
    if (timing === 'before_candidates') expect(candidates.rows).toEqual([]);
    else { expect(candidates.rows).toHaveLength(1); retain(); }
    expect(() => reconcile(run, visit, 'cancelled')).toThrow(/pims_invalid/);
    expect(sql('select archived_at is null from public.pims_visits')).toBe('t');
  });
  it('reconciles an unresolved unchanged explicit cancellation from a partial capture', () => {
    const { run, visit } = seededVisit();
    const captured_at = new Date().toISOString();
    rpc('pims_submit_sync', submission(run, { request_id: group, captured_at, items: [item({ expected_version: 1, status: 'cancelled' })] }), member);
    seal(run, 'partial');
    expect(reconcile(run, visit, 'cancelled', { captured_at })).toMatchObject({ outcome: 'applied', version: 2 });
  });
  it.each(['cancelled', 'deleted'])('archives only after explicit fresh %s status, replaying without churn', (status) => {
    const { run, visit } = missingRun();
    const captured_at = new Date().toISOString();
    const result = reconcile(run, visit, status, { captured_at });
    expect(result).toMatchObject({ outcome: 'applied', version: 2 });
    expect(reconcile(run, visit, status, { captured_at })).toEqual(result);
    expect(sql('select archive_kind from public.pims_visits')).toBe('source');
  });
  it('resyncs a missing active appointment moved outside the captured day, not its identity', () => {
    const { run, visit } = missingRun();
    const appointment = item({ expected_version: 1, starts_at: '2026-11-03T15:00:00Z', ends_at: '2026-11-03T15:30:00Z' });
    expect(reconcile(run, visit, 'active', { appointment })).toMatchObject({ outcome: 'applied', version: 2 });
    expect(sql('select archived_at is null from public.pims_visits')).toBe('t');
  });
  it('does not accept a reconciliation proposal for a different appointment', () => {
    const { run, visit } = missingRun();
    const appointment = item({ appointment_id: 'different', expected_version: 1, starts_at: '2026-11-03T15:00:00Z', ends_at: '2026-11-03T15:30:00Z' });
    expect(reconcile(run, visit, 'active', { appointment })).toMatchObject({ outcome: 'conflict', reason: 'identity_changed' });
    const issue = rpc('pims_review_page', { connection_id: connection.id, collection: 'issues' }, member).rows[0];
    expect(() => rpc('pims_resolve_issue', { connection_id: connection.id, issue_id: issue.id, expected_version: 1, request_id: group, action: 'accept_schedule' }, member)).toThrow(/pims_identity/);
    expect(sql('select version from public.pims_visits')).toBe('1');
  });
  it('rejects stale status capture, tenant changes, version races and expired leases', () => {
    const { run, visit } = missingRun();
    expect(() => reconcile(run, visit, 'cancelled', { captured_at: '2020-01-01T00:00:00Z' })).toThrow(/pims_stale/);
    expect(() => reconcile(run, visit, 'cancelled', { identity: { ...identity, tenant_id: 'other' } })).toThrow(/pims_identity/);
    expect(reconcile(run, visit, 'cancelled', { expected_version: 0 })).toMatchObject({ outcome: 'conflict', reason: 'visit_version' });
    sql("update public.pims_sync_runs set expires_at=clock_timestamp()-interval '1 second'");
    expect(() => reconcile(run, visit, 'cancelled', { request_id: chunk })).toThrow(/pims_stale/);
  });
});
