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
  it('stores unknown appointment end times without inventing a duration', () => {
    links();
    const run = start();
    expect(rpc('pims_submit_sync', submission(run, { items: [item({ ends_at: null })] }), member).outcomes[0].outcome).toBe('applied');
    expect(sql('select ends_at is null from public.pims_visits')).toBe('t');
  });
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
    const setupPath = 'supabase/migrations/20261202_pims_setup.sql';
    if (existsSync(setupPath)) {
      sql(readFileSync(setupPath, 'utf8'));
      sql(readFileSync(setupPath, 'utf8'));
    }
    const uploadsPath = 'supabase/migrations/20261203_pims_upload_attempts.sql';
    if (existsSync(uploadsPath)) {
      sql(readFileSync(uploadsPath, 'utf8'));
      sql(readFileSync(uploadsPath, 'utf8'));
    }
    const observationsPath = 'supabase/migrations/20261204_pims_upload_observations.sql';
    if (existsSync(observationsPath)) {
      sql(readFileSync(observationsPath, 'utf8'));
      sql(readFileSync(observationsPath, 'utf8'));
    }
    const imagesPath = 'supabase/migrations/20261205_pims_image_attempts.sql';
    if (existsSync(imagesPath)) {
      sql(readFileSync(imagesPath, 'utf8'));
      sql(readFileSync(imagesPath, 'utf8'));
    }
    const imageObservationsPath = 'supabase/migrations/20261206_pims_image_observations.sql';
    if (existsSync(imageObservationsPath)) {
      sql(readFileSync(imageObservationsPath, 'utf8'));
      sql(readFileSync(imageObservationsPath, 'utf8'));
    }
    const configuredPath = 'supabase/migrations/20261207_pims_configured_sync.sql';
    if (existsSync(configuredPath)) {
      sql(readFileSync(configuredPath, 'utf8'));
      sql(readFileSync(configuredPath, 'utf8'));
    }
    const instinctConfiguredPath = 'supabase/migrations/20261208_pims_instinct_configured_sync.sql';
    if (existsSync(instinctConfiguredPath)) {
      sql(readFileSync(instinctConfiguredPath, 'utf8'));
      sql(readFileSync(instinctConfiguredPath, 'utf8'));
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

  describe('configured-practice confirmation', () => {
    const confirm = (changes: Record<string, unknown> = {}, actor = owner) => rpc('pims_confirm_configured_connection', {
      connection_id: connection.id, expected_revision: connection.revision, acknowledged: true, ...changes,
    }, actor);
    it('records owner confirmation separately from provider verification and exposes the binding mode', () => {
      const result = confirm();
      expect(result).toMatchObject({ state: 'active', revision: connection.revision+1, binding_mode: 'user_confirmed', verified_at: null });
      expect(result.confirmed_at).toBeTruthy();
      expect(rpc('pims_setup_context', { practice_id: practice }).connections[0]).toMatchObject({ binding_mode: 'user_confirmed' });
      expect(sql(`select action from public.pims_audit_events where action='configured_practice_confirmed'`)).toBe('configured_practice_confirmed');
    });
    it.each([member, outsider])('rejects non-owner actor %s before changing state', actor => {
      expect(() => confirm({}, actor)).toThrow(/pims_forbidden/);
      expect(sql(`select revision from public.pims_connections where id='${connection.id}'`)).toBe(String(connection.revision));
    });
    it.each([false, 'true', null, 1])('requires explicit boolean acknowledgment (%s)', acknowledged => {
      expect(() => confirm({ acknowledged })).toThrow(/pims_invalid/);
    });
    it('rejects stale revisions and replay after confirmation', () => {
      expect(() => confirm({expected_revision: connection.revision-1})).toThrow(/pims_conflict/);
      confirm(); expect(() => confirm()).toThrow(/pims_conflict/);
      expect(sql(`select count(*) from public.pims_audit_events where action='configured_practice_confirmed'`)).toBe('1');
    });
    it('interrupts a previous run when the configured identity confirmation changes revision', () => {
      const run = start(); confirm();
      expect(sql(`select state from public.pims_sync_runs where id='${run.id}'`)).toBe('interrupted');
    });
    it('clears manual confirmation when configuration changes', () => {
      const result = confirm();
      const changed = rpc('pims_configure_connection', { ...connectionInput, connection_id: result.id, expected_revision: result.revision });
      expect(changed).toMatchObject({state:'unverified', binding_mode:'provider_observed',confirmed_at:null,verified_at:null});
    });
    it('keeps observed providers on their existing verification path', () => {
      const configured = rpc('pims_configure_connection', { ...connectionInput, provider:'rhapsody', origin:'https://app.rhapsody.vet' });
      expect(() => confirm({connection_id:configured.id,expected_revision:configured.revision})).toThrow(/pims_invalid/);
    });
    it('persists linked appointments through the durable ledger after configured confirmation', () => {
      connection = confirm(); links();
      const run = start();
      const result = rpc('pims_submit_sync', submission(run, {identity:{...identity,connection_revision:connection.revision}}), member);
      expect(result.outcomes[0]).toMatchObject({appointment_id:'appointment-1',outcome:'applied',version:1});
      expect(sql(`select count(*) from public.pims_visits where connection_id='${connection.id}'`)).toBe('1');
    });
    it('confirms Instinct and persists namespaced visits through the linked durable ledger', () => {
      connection = rpc('pims_configure_connection', { ...connectionInput, provider: 'instinct', origin: 'https://clinic.instinctvet.cloud' });
      expect(() => confirm({}, member)).toThrow(/pims_forbidden/);
      expect(() => confirm({ acknowledged: false })).toThrow(/pims_invalid/);
      const revision = connection.revision;
      connection = confirm();
      expect(connection).toMatchObject({ revision: revision + 1, binding_mode: 'user_confirmed', state: 'active', verified_at: null });
      links();const run = start();
      const capture = submission(run, { identity: { ...identity, provider: 'instinct', origin: connection.origin, connection_revision: connection.revision } });
      capture.items[0].appointment_id = 'visit:visit-1';
      capture.items[0].encounter_id = 'visit-1';
      const result = rpc('pims_submit_sync', capture, member);
      expect(result.outcomes[0]).toMatchObject({ appointment_id: 'visit:visit-1', outcome: 'applied', version: 1 });
      expect(sql(`select encounter_id from public.pims_visits where connection_id='${connection.id}'`)).toBe('visit-1');
      expect(sql(`select count(*) from public.pims_visits where connection_id='${connection.id}'`)).toBe('1');
    });
    it('does not grant direct authenticated table writes', () => {
      expect(() => sql(userSql(owner, `update public.pims_connections set binding_mode='user_confirmed' where id='${connection.id}'`))).toThrow(/permission denied/);
    });
  });

  describe('durable image attempts', () => {
    const chart = '88888888-8888-4888-8888-888888888888';
    const image = '99999999-9999-4999-8999-999999999999';
    let payload: Record<string, unknown>;
    beforeEach(() => {
      links();
      sql(`insert into public.charts(id,created_by,practice_id) values('${chart}','${member}','${practice}');
        insert into public.attachments(id,created_by,chart_id,path) values('${image}','${member}','${chart}','${member}/${chart}/${image}.png')`);
      const source = rpc('pims_draft_context', { chart_id: chart }, member).source;
      rpc('pims_link_chart', { connection_id: connection.id, chart_id: chart, patient_id: 'patient-1', expected_version: 0,
        source_hash: source.hash, request_id: group, reason: 'Verified source chart' });
      payload = { request_id: request, connection_id: connection.id, connection_revision: connection.revision, chart_id: chart,
        chart_link_version: 1, image_id: image, source_hash: source.hash, patient_id: 'patient-1', encounter_id: 'encounter-1',
        destination: 'Medical Notes', document_generation: 'page-1', content_hash: 'a'.repeat(64), content_bytes: 1234 };
    });
    const prepare = (changes: Record<string, unknown> = {}, actor = member) => rpc('pims_prepare_image_transfer', { ...payload, ...changes }, actor);
    describe('manual image observations', () => {
      const page = (changes: Record<string, unknown> = {}, actor = member) => rpc('pims_image_review_page', { chart_id: chart, ...changes }, actor);
      const observe = (attempt: string, changes: Record<string, unknown> = {}, actor = member) => rpc('pims_record_image_observation', {
        chart_id: chart, attempt_id: attempt, request_id: chunk, expected_version: 0, observation: 'uncertain', note: 'Checked the destination', ...changes,
      }, actor);
      const unknown = () => {
        const attempt = prepare().attempt;
        rpc('pims_dispatch_image_transfer', { attempt_id: attempt.id }, member);
        return attempt.id;
      };
      it.each(['present', 'not_found', 'uncertain'])('records %s without confirming or unlocking an image write', observation => {
        const attempt = unknown();
        expect(page().rows[0]).toMatchObject({ kind: 'image', id: attempt, image_id: image, encounter_id: 'encounter-1', destination: 'Medical Notes', review_version: 0, observation: null });
        expect(observe(attempt, { observation })).toMatchObject({ chart_id: chart, attempt_id: attempt, observation, version: 1, actor_id: member });
        expect(page().rows[0]).toMatchObject({ state: 'unknown', review_version: 1, observation: { observation } });
        expect(prepare({ request_id: nextRequest })).toMatchObject({ created: false, attempt: { id: attempt, state: 'unknown' } });
        expect(rpc('pims_dispatch_image_transfer', { attempt_id: attempt }, member).execute).toBe(false);
        expect(sql('select resource_id is null and confirmed_at is null from public.pims_image_attempts')).toBe('t');
      });
      it('replays exact observations but rejects changed requests, actors and stale versions', () => {
        const attempt = unknown(), receipt = observe(attempt);
        expect(observe(attempt)).toEqual(receipt);
        expect(() => observe(attempt, { note: 'Changed' })).toThrow(/pims_idempotency/);
        expect(() => observe(attempt, {}, owner)).toThrow(/pims_idempotency/);
        expect(() => observe(attempt, { request_id: nextRequest })).toThrow(/pims_conflict/);
        expect(observe(attempt, { request_id: nextRequest, expected_version: 1, observation: 'present' }, owner)).toMatchObject({ version: 2 });
        expect(sql("select count(*) from public.pims_audit_events where action='image_manually_reviewed'")).toBe('2');
      });
      it('serializes competing reviews without losing an observation', async () => {
        const attempt = unknown();
        const results = await Promise.allSettled([chunk, nextRequest].map(request_id => asyncSql(userSql(member,
          callStatement('pims_record_image_observation', { chart_id: chart, attempt_id: attempt, request_id, expected_version: 0, observation: 'uncertain', note: 'Checked' })))));
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        expect(String((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason)).toContain('pims_conflict');
        expect(sql('select count(*) from public.pims_image_observations')).toBe('1');
      });
      it('serializes a shared request ID across different connections as an idempotency conflict', async () => {
        const attempt = unknown();
        const otherConnection = rpc('pims_configure_connection', { ...connectionInput, tenant_id: 'clinic-2' });
        const otherAttempt = sql(`insert into public.pims_image_attempts(id,request_id,practice_id,connection_id,connection_revision,chart_id,chart_link_version,image_id,image_snapshot,source_hash,patient_id,encounter_id,destination,document_generation,content_hash,content_bytes,identity,payload_hash,actor_id,state,dispatched_at)
          select gen_random_uuid(),gen_random_uuid(),practice_id,'${otherConnection.id}',connection_revision,chart_id,chart_link_version,image_id,image_snapshot,source_hash,patient_id,encounter_id,destination,document_generation,content_hash,content_bytes,identity,payload_hash,actor_id,state,dispatched_at
          from public.pims_image_attempts where id='${attempt}' returning id`);
        sql(`create function public.delay_image_observation() returns trigger language plpgsql as $$ begin perform pg_sleep(0.5); return new; end $$;
          create trigger delay_image_observation before insert on public.pims_image_observations for each row execute function public.delay_image_observation()`);
        try {
          const results = await Promise.allSettled([attempt, otherAttempt].map(attempt_id => asyncSql(userSql(member,
            callStatement('pims_record_image_observation', { chart_id: chart, attempt_id, request_id: chunk, expected_version: 0, observation: 'uncertain', note: 'Checked' })))));
          expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
          expect(String((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason)).toContain('pims_idempotency');
          expect(sql('select count(*) from public.pims_image_observations')).toBe('1');
          expect(sql("select count(*) from public.pims_audit_events where action='image_manually_reviewed'")).toBe('1');
        } finally {
          sql('drop trigger delay_image_observation on public.pims_image_observations; drop function public.delay_image_observation()');
        }
      });
      it.each(['outsider', 'removed', 'private', 'moved'])('denies %s access before replay and through RLS', change => {
        const attempt = unknown();
        observe(attempt);
        const actor = change === 'outsider' ? outsider : member;
        if (change === 'removed') sql(`delete from public.practice_members where user_id='${member}'`);
        if (change === 'private') sql(`update public.charts set practice_id=null where id='${chart}'`);
        if (change === 'moved') sql(`update public.charts set practice_id='${otherPractice}' where id='${chart}'`);
        expect(() => observe(attempt, {}, actor)).toThrow(/pims_forbidden/);
        expect(() => page({}, actor)).toThrow(/pims_forbidden/);
        expect(sql(userSql(actor, 'select count(*) from public.pims_image_observations'))).toBe('0');
        if (change === 'moved') expect(page({}, outsider).rows).toEqual([]);
      });
      it('permits historical review after expiry or connection relinking but not redispatch', () => {
        const attempt = unknown();
        sql("update public.pims_image_attempts set expires_at=clock_timestamp()-interval '1 hour'; update public.pims_connections set state='disabled',revision=revision+1; update public.pims_chart_links set version=version+1");
        expect(observe(attempt)).toMatchObject({ version: 1 });
        expect(page().rows[0]).toMatchObject({ id: attempt, state: 'unknown', connection_revision: 2 });
        expect(rpc('pims_dispatch_image_transfer', { attempt_id: attempt }, member).execute).toBe(false);
      });
      it('pages only historical unknown attempts without disclosing attachment snapshots', () => {
        const attempt = unknown();
        sql(`insert into public.pims_image_attempts(id,request_id,practice_id,connection_id,connection_revision,chart_id,chart_link_version,image_id,image_snapshot,source_hash,patient_id,encounter_id,destination,document_generation,content_hash,content_bytes,identity,payload_hash,actor_id,state,dispatched_at)
          select gen_random_uuid(),gen_random_uuid(),practice_id,connection_id,connection_revision,chart_id,chart_link_version,image_id,image_snapshot,source_hash,'patient-'||series,encounter_id,destination,document_generation,content_hash,content_bytes,identity,payload_hash,actor_id,state,dispatched_at
          from public.pims_image_attempts cross join generate_series(2,52) series where id='${attempt}'`);
        const first = page(), second = page({ cursor: first.next_cursor });
        expect(first.rows).toHaveLength(50);
        expect(first.next_cursor).toBe(first.rows[49].id);
        expect(second.rows).toHaveLength(2);
        expect(second.next_cursor).toBeNull();
        const ids = [...first.rows, ...second.rows].map(row => row.id);
        expect(new Set(ids).size).toBe(52);
        expect(ids).toEqual([...ids].sort());
        for (const row of [...first.rows, ...second.rows]) {
          expect(Object.keys(row).sort()).toEqual(['kind', 'id', 'chart_id', 'connection_id', 'connection_revision', 'identity', 'patient_id', 'encounter_id', 'destination', 'document_generation', 'image_id', 'content_hash', 'dispatched_at', 'state', 'review_version', 'observation'].sort());
        }
        expect(page({ cursor: second.rows[1].id })).toEqual({ rows: [], next_cursor: null });
        expect(() => page({ cursor: '' })).toThrow(/pims_invalid/);
        expect(() => page({ patient_id: 'patient-1' })).toThrow(/pims_invalid/);
      });
      it.each(['anon', 'service_role'])('denies %s access to image review functions and observations', role => {
        const attempt = unknown();
        observe(attempt);
        for (const statement of [callStatement('pims_image_review_page', { chart_id: chart }),
          callStatement('pims_record_image_observation', { chart_id: chart, attempt_id: attempt }),
          'select * from public.pims_image_observations',
          'select pims_private.image_observation_json(null::public.pims_image_observations)']) {
          expect(() => sql(`set role ${role}; ${statement}`)).toThrow(/permission denied/);
        }
      });
      it('keeps history reviewable after source deletion without exposing its old storage path', () => {
        const attempt = unknown();
        sql(`delete from public.attachments where id='${image}'`);
        expect(observe(attempt)).toMatchObject({ version: 1 });
        expect(page().rows[0]).toMatchObject({ image_id: image, state: 'unknown' });
        expect(JSON.stringify(page())).not.toContain(`${member}/${chart}/${image}.png`);
        expect(() => sql(userSql(member, 'select pims_private.image_observation_json(null::public.pims_image_observations)'))).toThrow(/permission denied/);
      });
      it.each([{ observation: 'confirmed' }, { note: '' }, { note: 'x'.repeat(201) }, { note: 'line\nbreak' }, { actor_id: owner }, { expected_version: -1 }])('rejects invalid image observation %j', changes => {
        expect(() => observe(unknown(), changes)).toThrow(/pims_invalid/);
      });
      it('rejects chart substitution, direct writes and reviews of prepared or confirmed attempts', () => {
        const attempt = prepare().attempt.id;
        expect(() => observe(attempt)).toThrow(/pims_conflict/);
        rpc('pims_dispatch_image_transfer', { attempt_id: attempt }, member);
        expect(() => observe(attempt, { chart_id: group })).toThrow(/pims_forbidden/);
        observe(attempt);
        expect(() => sql(userSql(member, "update public.pims_image_observations set observation='present'"))).toThrow(/permission denied/);
        expect(() => sql(userSql(member, 'delete from public.pims_image_observations'))).toThrow(/permission denied/);
        rpc('pims_confirm_image_transfer', { attempt_id: attempt, content_hash: payload.content_hash, resource_id: 'file-1' }, member);
        expect(() => observe(attempt, { request_id: nextRequest, expected_version: 1 })).toThrow(/pims_conflict/);
        expect(page().rows).toEqual([]);
      });
    });
    it('keeps ambiguous writes locked across new UUIDs and browser document generations', () => {
      const attempt = prepare().attempt;
      expect(rpc('pims_dispatch_image_transfer', { attempt_id: attempt.id }, member)).toMatchObject({ execute: true, attempt: { state: 'unknown' } });
      expect(prepare({ request_id: nextRequest, document_generation: 'reloaded-page' })).toMatchObject({ created: false, attempt: { id: attempt.id, state: 'unknown' } });
      expect(rpc('pims_dispatch_image_transfer', { attempt_id: attempt.id }, member).execute).toBe(false);
      expect(sql('select count(*) from public.pims_image_attempts')).toBe('1');
    });
    it('allows one dispatch across separate database sessions', async () => {
      const attempt = prepare().attempt;
      const results = await Promise.all([1, 2].map(() => asyncSql(userSql(member, callStatement('pims_dispatch_image_transfer', { attempt_id: attempt.id })))));
      expect(results.map(value => JSON.parse(value).execute).sort()).toEqual([false, true]);
    });
    it.each(['unknown', 'confirmed'])('reauthorizes chart access before replaying a %s dispatch', (state) => {
      const attempt = prepare().attempt;
      rpc('pims_dispatch_image_transfer', { attempt_id: attempt.id }, member);
      if (state === 'confirmed') rpc('pims_confirm_image_transfer', { attempt_id: attempt.id, content_hash: payload.content_hash, resource_id: 'file-1' }, member);
      sql(`update public.charts set practice_id='${otherPractice}' where id='${chart}'`);
      expect(sql(userSql(member, 'select count(*) from public.pims_image_attempts'))).toBe('0');
      expect(() => rpc('pims_dispatch_image_transfer', { attempt_id: attempt.id }, member)).toThrow(/pims_forbidden/);
    });
    it('renews only an expired undispatched preparation using a new attempt identity', () => {
      const old = prepare().attempt;
      sql("update public.pims_image_attempts set expires_at=clock_timestamp()-interval '1 second'");
      const renewed = prepare({ request_id: nextRequest, document_generation: 'page-2' });
      expect(renewed).toMatchObject({ created: true, attempt: { state: 'prepared', request_id: nextRequest } });
      expect(renewed.attempt.id).not.toBe(old.id);
      expect(sql(`select state from public.pims_image_attempts where id='${old.id}'`)).toBe('expired');
      expect(rpc('pims_dispatch_image_transfer', { attempt_id: old.id }, member)).toMatchObject({ execute: false, attempt: { state: 'expired' } });
      expect(prepare()).toMatchObject({ created: false, attempt: { id: old.id, state: 'expired' } });
      expect(rpc('pims_dispatch_image_transfer', { attempt_id: renewed.attempt.id }, member).execute).toBe(true);
    });
    it('serializes competing renewals of an expired undispatched preparation', async () => {
      const old = prepare().attempt;
      sql("update public.pims_image_attempts set expires_at=clock_timestamp()-interval '1 second'");
      const replies = await Promise.all([nextRequest, chunk].map(request_id => asyncSql(userSql(member,
        callStatement('pims_prepare_image_transfer', { ...payload, request_id })))));
      const results = replies.map(value => JSON.parse(value));
      expect(results.map(result => result.created).sort()).toEqual([false, true]);
      expect(results[0].attempt.id).toBe(results[1].attempt.id);
      expect(results[0].attempt.id).not.toBe(old.id);
      expect(sql("select count(*) from public.pims_image_attempts where state='prepared'")).toBe('1');
    });
    it.each(['unknown', 'confirmed'])('never renews an expired %s outcome', (state) => {
      const old = prepare().attempt;
      rpc('pims_dispatch_image_transfer', { attempt_id: old.id }, member);
      if (state === 'confirmed') rpc('pims_confirm_image_transfer', { attempt_id: old.id, content_hash: payload.content_hash, resource_id: 'file-1' }, member);
      sql("update public.pims_image_attempts set expires_at=clock_timestamp()-interval '1 second'");
      expect(prepare({ request_id: nextRequest })).toMatchObject({ created: false, attempt: { id: old.id, state } });
      expect(sql('select count(*) from public.pims_image_attempts')).toBe('1');
    });
    it.each(['chart', 'image', 'link', 'connection', 'membership', 'disabled', 'expiry'])('rejects %s drift before dispatch', (change) => {
      const attempt = prepare().attempt;
      if (change === 'chart') sql(`update public.charts set patient_name='Changed' where id='${chart}'`);
      if (change === 'image') sql(`update public.attachments set caption='Changed' where id='${image}'`);
      if (change === 'link') sql('update public.pims_chart_links set version=version+1');
      if (change === 'connection') sql('update public.pims_connections set revision=revision+1');
      if (change === 'membership') sql(`delete from public.practice_members where user_id='${member}'`);
      if (change === 'disabled') sql('update public.practices set pims_send_enabled=false');
      if (change === 'expiry') sql("update public.pims_image_attempts set expires_at=clock_timestamp()-interval '1 second'");
      expect(() => rpc('pims_dispatch_image_transfer', { attempt_id: attempt.id }, member)).toThrow(/pims_/);
      expect(sql('select state from public.pims_image_attempts')).toBe('prepared');
    });
    it('requires exact identity, authorized chart and a bounded digest', () => {
      for (const changes of [{ patient_id: 'wrong' }, { chart_link_version: 2 }, { source_hash: 'b'.repeat(64) }, { content_hash: 'bad' }, { content_bytes: 2097153 }, { encounter_id: '' }]) {
        expect(() => prepare(changes)).toThrow(/pims_/);
      }
      expect(() => prepare({}, outsider)).toThrow(/pims_forbidden/);
      const attempt = prepare().attempt;
      expect(sql(userSql(outsider, 'select count(*) from public.pims_image_attempts'))).toBe('0');
      expect(() => sql(userSql(member, "update public.pims_image_attempts set state='confirmed'"))).toThrow(/permission denied/);
      expect(() => rpc('pims_dispatch_image_transfer', { attempt_id: attempt.id }, owner)).toThrow(/pims_forbidden/);
    });
    it('confirms only matching content and saved resource, without unlocking duplicate retries', () => {
      const attempt = prepare().attempt;
      const confirm = { attempt_id: attempt.id, content_hash: payload.content_hash, resource_id: 'file-1' };
      expect(() => rpc('pims_confirm_image_transfer', confirm, member)).toThrow(/pims_conflict/);
      rpc('pims_dispatch_image_transfer', { attempt_id: attempt.id }, member);
      expect(() => rpc('pims_confirm_image_transfer', { ...confirm, content_hash: 'b'.repeat(64) }, member)).toThrow(/pims_identity/);
      expect(rpc('pims_confirm_image_transfer', confirm, member)).toMatchObject({ state: 'confirmed', resource_id: 'file-1' });
      expect(prepare({ request_id: nextRequest })).toMatchObject({ created: false, attempt: { id: attempt.id, state: 'confirmed' } });
    });
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
    const prepareUpload = (changes: Record<string, unknown> = {}, actor = member) => rpc('pims_prepare_upload', {
      request_id: nextRequest, connection_id: connection.id, connection_revision: connection.revision,
      chart_id: chartId, draft_id: draftId, draft_version: 2, patient_id: 'patient-1', chart_link_version: 1,
      location_id: 'location-2', endpoint: 'https://api.instinctvet.com/graphql', content_hash: 'a'.repeat(64), content_bytes: 1024, ...changes,
    }, actor);
    function uploadFixture() {
      connection = rpc('pims_configure_connection', { ...connectionInput, provider: 'instinct', origin: 'https://clinic.instinctvet.cloud' });
      connection = rpc('pims_verify_connection', { connection_id: connection.id, expected_revision: 1, provider: connection.provider,
        origin: connection.origin, tenant_id: connection.tenant_id, observed_at: new Date().toISOString() });
      links(); save(); review();
      rpc('pims_link_chart', { connection_id: connection.id, chart_id: chartId, patient_id: 'patient-1', expected_version: 0,
        source_hash: context().source.hash, request_id: group, reason: 'Checked both patient records' });
    }
    const uploadPage = (changes: Record<string, unknown> = {}, actor = member) => rpc('pims_upload_review_page', { chart_id: chartId, ...changes }, actor);
    function unknownUpload() {
      uploadFixture();
      const prepared = prepareUpload();
      rpc('pims_dispatch_upload', { attempt_id: prepared.attempt.id }, member);
      return prepared.attempt.id as string;
    }
    const observation = (attemptId: string, changes: Record<string, unknown> = {}, actor = member) => rpc('pims_record_upload_observation', {
      chart_id: chartId, attempt_id: attemptId, request_id: request, expected_version: 0,
      observation: 'not_found', note: 'Checked the patient document list', ...changes,
    }, actor);
    it('records a manual observation without confirming a save or releasing duplicate protection', () => {
      const attemptId = unknownUpload();
      expect(uploadPage().rows).toEqual([expect.objectContaining({ id: attemptId, chart_id: chartId, state: 'unknown', review_version: 0, observation: null })]);
      const receipt = observation(attemptId);
      expect(receipt).toMatchObject({ attempt_id: attemptId, chart_id: chartId, version: 1, actor_id: member, observation: 'not_found' });
      expect(Date.parse(receipt.created_at)).toBeGreaterThan(0);
      expect(uploadPage().rows[0]).toMatchObject({ state: 'unknown', review_version: 1, observation: receipt });
      expect(prepareUpload({ request_id: chunk })).toMatchObject({ created: false, attempt: { id: attemptId, state: 'unknown' } });
      expect(rpc('pims_dispatch_upload', { attempt_id: attemptId }, member).execute).toBe(false);
      expect(sql('select confirmed_at is null and file_id is null from public.pims_upload_attempts')).toBe('t');
    });
    it('replays exact manual observations but rejects request reuse and stale competing reviews', () => {
      const attemptId = unknownUpload(), receipt = observation(attemptId);
      expect(observation(attemptId)).toEqual(receipt);
      expect(() => observation(attemptId, { note: 'Different' })).toThrow(/pims_idempotency/);
      expect(() => observation(attemptId, {}, owner)).toThrow(/pims_idempotency/);
      expect(() => observation(attemptId, { request_id: chunk })).toThrow(/pims_conflict/);
      expect(observation(attemptId, { request_id: chunk, expected_version: 1, observation: 'present' }, owner)).toMatchObject({ version: 2, actor_id: owner });
      expect(sql('select count(*) from public.pims_upload_observations')).toBe('2');
      expect(sql("select count(*) from public.pims_audit_events where action='upload_manually_reviewed'")).toBe('2');
    });
    it('serializes concurrent manual observations without overwriting either author', async () => {
      const attemptId = unknownUpload();
      const payload = { chart_id: chartId, attempt_id: attemptId, expected_version: 0, observation: 'uncertain', note: 'Unable to determine outcome' };
      const results = await Promise.allSettled([request, chunk].map(request_id => asyncSql(userSql(member,
        callStatement('pims_record_upload_observation', { ...payload, request_id })))));
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(String((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason)).toContain('pims_conflict');
      expect(sql('select count(*) from public.pims_upload_observations')).toBe('1');
    });
    it('allows historical observations after expiry or relinking without reauthorizing an upload', () => {
      const attemptId = unknownUpload();
      sql("update public.pims_upload_attempts set expires_at=clock_timestamp()-interval '1 hour'; update public.pims_connections set state='disabled',revision=revision+1; update public.pims_chart_links set version=version+1");
      expect(observation(attemptId)).toMatchObject({ version: 1 });
      expect(uploadPage().rows[0]).toMatchObject({ state: 'unknown', patient_id: 'patient-1', location_id: 'location-2' });
      expect(sql('select state from public.pims_upload_attempts')).toBe('unknown');
    });
    it.each(['outsider','removed','private','moved'])('denies %s access to upload review, receipts and replay', (change) => {
      const attemptId = unknownUpload();
      observation(attemptId);
      let actor = member;
      if (change === 'outsider') actor = outsider;
      if (change === 'removed') sql(`delete from public.practice_members where user_id='${member}'`);
      if (change === 'private') sql(`update public.charts set practice_id=null where id='${chartId}'`);
      if (change === 'moved') sql(`update public.charts set practice_id='${otherPractice}' where id='${chartId}'`);
      expect(() => observation(attemptId, {}, actor)).toThrow(/pims_forbidden/);
      if (change !== 'moved') expect(() => uploadPage({}, actor)).toThrow(/pims_forbidden/);
      expect(sql(userSql(actor, 'select count(*) from public.pims_upload_observations'))).toBe('0');
    });
    it('does not expose attempts from a former practice when a chart changes practice', () => {
      unknownUpload();
      sql(`update public.charts set practice_id='${otherPractice}' where id='${chartId}'`);
      expect(uploadPage({}, outsider).rows).toEqual([]);
    });
    it.each([{ observation: 'confirmed' }, { note: '' }, { note: 'x'.repeat(201) }, { note: 'line\nbreak' }, { actor_id: owner }, { expected_version: -1 }])('rejects invalid observation payload %j', changes => {
      const attemptId = unknownUpload();
      expect(() => observation(attemptId, changes)).toThrow(/pims_invalid/);
    });
    it('only reviews unknown attempts, rejects chart substitution and prevents direct writes', () => {
      uploadFixture();
      const prepared = prepareUpload(), reference = { attempt_id: prepared.attempt.id };
      expect(() => observation(prepared.attempt.id)).toThrow(/pims_conflict/);
      rpc('pims_dispatch_upload', reference, member);
      expect(() => observation(prepared.attempt.id, { chart_id: group })).toThrow(/pims_forbidden/);
      observation(prepared.attempt.id);
      expect(() => sql(userSql(member, "update public.pims_upload_observations set observation='present'"))).toThrow();
      expect(() => sql(userSql(member, 'delete from public.pims_upload_observations'))).toThrow();
      rpc('pims_confirm_upload', { ...reference, file_id: 'file-1', patient_id: 'patient-1', content_hash: 'a'.repeat(64) }, member);
      expect(() => observation(prepared.attempt.id, { request_id: chunk, expected_version: 1 })).toThrow(/pims_conflict/);
      expect(uploadPage().rows).toEqual([]);
    });
    it('pages unknown attempts with a stable cursor without disclosing provider credentials', () => {
      const attemptId = unknownUpload();
      sql(`insert into public.pims_upload_attempts(id,request_id,practice_id,connection_id,connection_revision,chart_id,draft_id,draft_version,patient_id,chart_link_version,location_id,endpoint,content_hash,content_bytes,source_hash,identity,payload_hash,actor_id,state,dispatched_at)
        select gen_random_uuid(),gen_random_uuid(),practice_id,connection_id,connection_revision,chart_id,draft_id,draft_version,'patient-'||series,chart_link_version,location_id,endpoint,content_hash,content_bytes,source_hash,identity,payload_hash,actor_id,state,dispatched_at
        from public.pims_upload_attempts cross join generate_series(2,52) series where id='${attemptId}'`);
      const first = uploadPage(), second = uploadPage({ cursor: first.next_cursor });
      expect(first.rows).toHaveLength(50);
      expect(first.next_cursor).toBe(first.rows[49].id);
      expect(second.rows).toHaveLength(2);
      expect(second.next_cursor).toBeNull();
      expect(new Set([...first.rows, ...second.rows].map(row => row.id)).size).toBe(52);
      expect(first.rows[0]).not.toHaveProperty('endpoint');
      expect(first.rows[0]).not.toHaveProperty('payload_hash');
    });
    it('durably consumes upload dispatch once and blocks a new request for the same reviewed artifact', () => {
      uploadFixture();
      const prepared = prepareUpload();
      expect(prepared).toMatchObject({ created: true, attempt: { state: 'prepared', patient_id: 'patient-1', location_id: 'location-2' } });
      const reference = { attempt_id: prepared.attempt.id };
      expect(rpc('pims_dispatch_upload', reference, member)).toMatchObject({ execute: true, attempt: { state: 'unknown' } });
      expect(rpc('pims_dispatch_upload', reference, member)).toMatchObject({ execute: false, attempt: { state: 'unknown' } });
      expect(prepareUpload({ request_id: chunk })).toMatchObject({ created: false, attempt: { id: prepared.attempt.id, state: 'unknown' } });
      expect(() => prepareUpload({ content_hash: 'b'.repeat(64) })).toThrow(/pims_idempotency/);
    });
    it('grants a single upload dispatch across concurrent database sessions', async () => {
      uploadFixture();
      const prepared = prepareUpload();
      const statement = userSql(member, callStatement('pims_dispatch_upload', { attempt_id: prepared.attempt.id }));
      const results = (await Promise.all([asyncSql(statement), asyncSql(statement)])).map(value => JSON.parse(value));
      expect(results.filter(value => value.execute)).toHaveLength(1);
      expect(results.every(value => value.attempt.state === 'unknown')).toBe(true);
    });
    it.each(['expiry', 'revision', 'relink', 'membership'])('blocks %s changes before provider dispatch', (change) => {
      uploadFixture();
      const prepared = prepareUpload();
      if (change === 'expiry') sql("update public.pims_upload_attempts set expires_at=clock_timestamp()-interval '1 second'");
      if (change === 'revision') sql('update public.pims_connections set revision=revision+1');
      if (change === 'relink') sql('update public.pims_chart_links set version=version+1');
      if (change === 'membership') sql(`delete from public.practice_members where user_id='${member}'`);
      expect(() => rpc('pims_dispatch_upload', { attempt_id: prepared.attempt.id }, member)).toThrow(/pims_(stale|identity|forbidden)/);
      expect(sql('select state from public.pims_upload_attempts')).toBe('prepared');
    });
    it('requires reviewed fresh drafts, matching patient links and current membership before upload', () => {
      uploadFixture();
      expect(() => prepareUpload({ patient_id: 'other' })).toThrow(/pims_identity/);
      expect(() => prepareUpload({}, outsider)).toThrow(/pims_forbidden/);
      const prepared = prepareUpload();
      sql(`update public.charts set patient_name='Changed' where id='${chartId}'`);
      expect(() => rpc('pims_dispatch_upload', { attempt_id: prepared.attempt.id }, member)).toThrow(/pims_stale/);
    });
    it('only records a matching receipt and keeps unknown outcomes blocked after a wrong acknowledgement', () => {
      uploadFixture();
      const prepared = prepareUpload(), reference = { attempt_id: prepared.attempt.id };
      rpc('pims_dispatch_upload', reference, member);
      expect(() => rpc('pims_confirm_upload', { ...reference, file_id: 'file-1', patient_id: 'other', content_hash: 'a'.repeat(64) }, member)).toThrow(/pims_identity/);
      expect(rpc('pims_confirm_upload', { ...reference, file_id: 'file-1', patient_id: 'patient-1', content_hash: 'a'.repeat(64) }, member)).toMatchObject({ state: 'confirmed', file_id: 'file-1' });
      expect(prepareUpload({ request_id: chunk })).toMatchObject({ created: false, attempt: { state: 'confirmed' } });
      expect(sql(userSql(outsider, 'select count(*) from public.pims_upload_attempts'))).toBe('0');
      expect(() => sql(userSql(member, "update public.pims_upload_attempts set state='prepared'"))).toThrow();
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
  }, 15000);
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
  it('accepts a reviewed schedule with an explicitly unknown end time', () => {
    const { run, visit } = seededVisit();
    rpc('pims_submit_sync', submission(run, { request_id: nextRequest, items: [item({ starts_at: '2026-11-01T16:00:00Z', ends_at: null })] }), member);
    const issue = rpc('pims_review_page', { connection_id: connection.id, collection: 'issues' }, member).rows[0];
    expect(rpc('pims_resolve_issue', { connection_id: connection.id, issue_id: issue.id, expected_version: visit.version,
      request_id: group, action: 'accept_schedule' }, member)).toMatchObject({ resolution: 'accept_schedule', visit_version: 2 });
    expect(sql('select ends_at is null from public.pims_visits')).toBe('t');
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
  it('reconciles active status with an unknown end time without manufacturing a duration', () => {
    const { run, visit } = missingRun();
    expect(reconcile(run, visit, 'active', { appointment: item({ expected_version: 1, ends_at: null }) })).toMatchObject({ outcome: 'applied', version: 2 });
    expect(sql('select ends_at is null from public.pims_visits')).toBe('t');
  });
  it('reads setup only for the primary owner and keeps configuration unverified', () => {
    const configured = rpc('pims_configure_connection', { ...connectionInput, tenant_id: 'new-clinic' });
    const context = rpc('pims_setup_context', { practice_id: practice });
    expect(context.connections.find((entry: any) => entry.id === configured.id).state).toBe('unverified');
    expect(context.members).toEqual(expect.arrayContaining([{ user_id: owner }, { user_id: member }]));
    for (const actor of [member, outsider]) {
      expect(() => rpc('pims_setup_context', { practice_id: practice }, actor)).toThrow(/pims_forbidden/);
      expect(() => rpc('pims_setup_page', { connection_id: connection.id, collection: 'patients' }, actor)).toThrow(/pims_forbidden/);
    }
  });
  it('pages confirmed links without silently truncating the setup inventory', () => {
    sql(`insert into public.pims_patient_groups values ('${group}','${practice}','${owner}',clock_timestamp());
      insert into public.pims_patient_links(practice_id,connection_id,patient_id,patient_key,created_by)
        select '${practice}','${connection.id}','patient-'||lpad(number::text,3,'0'),'${group}','${owner}' from generate_series(1,51) number`);
    const first = rpc('pims_setup_page', { connection_id: connection.id, collection: 'patients' });
    expect(first.rows).toHaveLength(50);
    const last = rpc('pims_setup_page', { connection_id: connection.id, collection: 'patients', cursor: first.next_cursor });
    expect(last.rows).toHaveLength(1);
    expect(last.next_cursor).toBeNull();
    expect(last.rows[0].patient_id).toBe('patient-051');
  });
  function chartLinkInput(chartPractice: string | null = practice) {
    links();
    sql(`insert into public.charts(id,created_by,practice_id,patient_name,patient_number,data)
      values ('${request}','${owner}',${chartPractice ? `'${chartPractice}'` : 'null'},'Milo','P-1','{"note":"keep"}')`);
    const source = chartPractice === practice ? rpc('pims_setup_page', { connection_id: connection.id, collection: 'charts' }).rows[0] : { source_hash: 'a'.repeat(64) };
    return { connection_id: connection.id, chart_id: request, patient_id: 'patient-1', expected_version: 0, source_hash: source.source_hash, request_id: nextRequest, reason: 'Checked both patient records' };
  }
  it('links historical charts explicitly with replay receipts and without changing chart data', () => {
    const input = chartLinkInput();
    const before = sql(`select to_jsonb(charts) from public.charts where id='${request}'`);
    const result = rpc('pims_link_chart', input);
    expect(result).toMatchObject({ chart_id: request, patient_id: 'patient-1', version: 1 });
    expect(rpc('pims_link_chart', input)).toEqual(result);
    expect(sql(`select to_jsonb(charts) from public.charts where id='${request}'`)).toBe(before);
    expect(sql("select count(*) from public.pims_audit_events where action='chart_linked'")).toBe('1');
    expect(() => rpc('pims_link_chart', { ...input, reason: 'changed' })).toThrow(/pims_idempotency/);
    expect(() => rpc('pims_link_chart', input, member)).toThrow(/pims_forbidden/);
  });
  it('requires current chart hash and link version when explicitly relinking a chart', () => {
    const input = chartLinkInput();
    rpc('pims_link_chart', input);
    rpc('pims_confirm_patient', { connection_id: connection.id, patient_id: 'patient-2', patient_key: chunk });
    const next = { ...input, patient_id: 'patient-2', request_id: chunk };
    expect(() => rpc('pims_link_chart', next)).toThrow(/pims_conflict/);
    expect(rpc('pims_link_chart', { ...next, expected_version: 1 })).toMatchObject({ version: 2, patient_id: 'patient-2' });
    sql(`update public.charts set patient_name='Different patient' where id='${request}'`);
    expect(() => rpc('pims_link_chart', { ...input, request_id: group, expected_version: 2 })).toThrow(/pims_stale/);
  });
  it.each([null, otherPractice])('rejects historical linking of charts outside this practice: %s', (chartPractice) => {
    const input = chartLinkInput(chartPractice);
    expect(() => rpc('pims_link_chart', input)).toThrow(/pims_forbidden/);
    expect(rpc('pims_setup_page', { connection_id: connection.id, collection: 'charts' }).rows).toEqual([]);
  });
  it('hides linked charts after unsharing and rejects replay after membership removal', () => {
    const input = chartLinkInput();
    rpc('pims_link_chart', input);
    sql(`update public.charts set practice_id=null where id='${request}'`);
    expect(sql(userSql(member, 'select count(*) from public.pims_chart_links'))).toBe('0');
    expect(() => rpc('pims_link_chart', input)).toThrow(/pims_forbidden/);
    sql(`delete from public.practice_members where user_id='${owner}'`);
    expect(() => rpc('pims_setup_context', { practice_id: practice })).toThrow(/pims_forbidden/);
  });
  it('enforces setup receipt connection/practice consistency in the database', () => {
    const input = chartLinkInput();
    rpc('pims_link_chart', input);
    expect(() => sql(`update public.pims_setup_actions set practice_id='${otherPractice}' where request_id='${nextRequest}'`)).toThrow(/foreign key/);
  });
  it('paginates historical charts with an empty first cursor and validates the next cursor', () => {
    chartLinkInput();
    sql(`insert into public.charts(id,created_by,practice_id) select gen_random_uuid(),'${owner}','${practice}' from generate_series(1,50)`);
    const page = rpc('pims_setup_page', { connection_id: connection.id, collection: 'charts' });
    expect(page.rows).toHaveLength(50);
    const next = rpc('pims_setup_page', { connection_id: connection.id, collection: 'charts', cursor: page.next_cursor });
    expect(next.rows).toHaveLength(1);
    expect(next.next_cursor).toBeNull();
    expect(new Set([...page.rows, ...next.rows].map((row: { chart_id: string }) => row.chart_id)).size).toBe(51);
    expect(() => rpc('pims_setup_page', { connection_id: connection.id, collection: 'charts', cursor: 'not-a-uuid' })).toThrow(/pims_invalid/);
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
