// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const container = process.env.PIMS_TEST_CONTAINER;
const database = 'pims_draft_languages_test';
const owner = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
const outsider = '33333333-3333-4333-8333-333333333333';
const practice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const chart = '88888888-8888-4888-8888-888888888888';
const draft = '99999999-9999-4999-8999-999999999999';
const migrationPath = 'supabase/migrations/20261220_polish_pims_drafts.sql';
const oldGuard = "language_value not in ('en','fr','de','it','es','hu','ro','zh','ar')";
const newGuard = "language_value not in ('en','fr','de','it','es','hu','ro','zh','ar','pl')";
const functionDefinition = () => sql("select pg_get_functiondef('public.pims_draft_write(jsonb)'::regprocedure)");
const functionSecurity = () => sql("select jsonb_build_object('acl',proacl,'config',proconfig,'definer',prosecdef) from pg_proc where oid='public.pims_draft_write(jsonb)'::regprocedure");
function sql(statement: string, db = database) {
  return execFileSync('docker', ['exec', '-i', container!, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db],
    { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
function asUser(actor: string, statement: string) {
  return sql(`begin; set local role authenticated; set local request.jwt.claim.sub='${actor}'; ${statement}; commit;`);
}
function rpc(name: string, payload: unknown, actor = member) {
  return JSON.parse(asUser(actor, `select public.${name}('${JSON.stringify(payload).replaceAll("'", "''")}'::jsonb)`));
}
const context = (actor = member) => rpc('pims_draft_context', { chart_id: chart }, actor);
const savePayload = (language = 'en', changes = {}) => ({ action: 'save', chart_id: chart, draft_id: draft,
  request_id: randomUUID(), expected_version: 0, kind: 'history', language, body: 'Clinical findings',
  source_hash: context().source.hash, ...changes });
const save = (language = 'en', changes = {}) => rpc('pims_draft_write', savePayload(language, changes));
const reviewPayload = () => ({ action: 'review', chart_id: chart, draft_id: draft, request_id: randomUUID(), expected_version: 1 });
const exportDraft = (version = 2, actor = member) => rpc('pims_draft_export', { chart_id: chart, draft_id: draft, expected_version: version }, actor);

describe.skipIf(!container)('PIMS draft app languages on isolated PostgreSQL', () => {
  beforeAll(() => {
    if (!container?.startsWith('toothops-pims-')) throw new Error('Use a disposable toothops-pims-* container');
    if (sql(`select exists(select 1 from pg_database where datname='${database}')`, 'postgres') !== 't') {
      sql(`create database ${database}`, 'postgres');
    }
    sql(readFileSync('scripts/pims/bootstrap.sql', 'utf8'));
    sql(readFileSync('supabase/migrations/20261129_pims_sync_foundation.sql', 'utf8'));
    sql(readFileSync('supabase/migrations/20261201_pims_transfer_drafts.sql', 'utf8'));
    sql(readFileSync('supabase/migrations/20261210_pims_draft_languages.sql', 'utf8'));
    const definition = functionDefinition();
    const security = functionSecurity();
    sql(readFileSync(migrationPath, 'utf8'));
    sql(readFileSync(migrationPath, 'utf8'));
    expect(functionDefinition()).toBe(definition.replace(oldGuard, newGuard));
    expect(functionSecurity()).toBe(security);
  });
  beforeEach(() => {
    sql(`truncate auth.users cascade;
      insert into auth.users values ('${owner}'),('${member}'),('${outsider}');
      insert into public.practices(id,owner) values ('${practice}','${owner}');
      insert into public.practice_members values ('${practice}','${owner}','owner'),('${practice}','${member}','member');
      insert into public.charts(id,created_by,practice_id,patient_name,data)
        values ('${chart}','${member}','${practice}','Milo','{"findings":"4.5 mm"}');`);
  });
  it.each(['en', 'fr', 'de', 'it', 'es', 'hu', 'ro', 'zh', 'ar', 'pl'])('saves, reviews and exports %s clinical drafts', language => {
    expect(save(language)).toMatchObject({ language, version: 1, reviewed_version: null });
    expect(() => exportDraft(1)).toThrow(/pims_unreviewed/);
    expect(rpc('pims_draft_write', reviewPayload())).toMatchObject({ language, version: 2, reviewed_version: 2, reviewed_by: member });
    expect(exportDraft()).toMatchObject({ language, body: 'Clinical findings', version: 2 });
  });
  it('rejects unsupported languages in both RPC and table constraint', () => {
    expect(() => save('pt')).toThrow(/pims_invalid/);
    expect(() => save('xx')).toThrow(/pims_invalid/);
    save();
    expect(() => sql("update public.pims_drafts set language='pt'")).toThrow(/pims_drafts_language_check/);
  });
  it('retains source, version, review and actor-bound replay guards for new languages', () => {
    const payload = savePayload('zh');
    const saved = rpc('pims_draft_write', payload);
    expect(rpc('pims_draft_write', payload)).toEqual(saved);
    expect(() => rpc('pims_draft_write', { ...payload, body: 'Changed' })).toThrow(/pims_idempotency/);
    expect(() => rpc('pims_draft_write', payload, owner)).toThrow(/pims_idempotency/);
    expect(() => save('ar')).toThrow(/pims_conflict/);
    const review = reviewPayload();
    rpc('pims_draft_write', review);
    expect(() => exportDraft(1)).toThrow(/pims_conflict/);
    expect(save('ar', { expected_version: 2 })).toMatchObject({ language: 'ar', version: 3, reviewed_version: null });
    expect(() => rpc('pims_draft_write', review)).toThrow(/pims_conflict/);
    expect(() => exportDraft(3)).toThrow(/pims_unreviewed/);
    sql(`update public.charts set data='{"findings":"changed"}' where id='${chart}'`);
    expect(() => exportDraft(3)).toThrow(/pims_stale/);
    expect(() => rpc('pims_draft_write', { ...review, request_id: randomUUID(), expected_version: 3 })).toThrow(/pims_stale/);
    expect(() => save('hu', { expected_version: 3, source_hash: payload.source_hash })).toThrow(/pims_stale/);
  });
  it('retains current membership, private chart, RLS and direct-write guards', () => {
    save('ro'); rpc('pims_draft_write', reviewPayload());
    expect(() => context(outsider)).toThrow(/pims_forbidden/);
    expect(() => exportDraft(2, outsider)).toThrow(/pims_forbidden/);
    expect(() => rpc('pims_draft_write', { ...reviewPayload(), expected_version: 2 }, outsider)).toThrow(/pims_forbidden/);
    expect(() => asUser(member, "update public.pims_drafts set language='ar'")).toThrow(/permission denied/);
    sql(`delete from public.practice_members where user_id='${member}'`);
    expect(() => exportDraft()).toThrow(/pims_forbidden/);
    expect(asUser(member, 'select count(*) from public.pims_drafts')).toBe('0');
    sql(`update public.charts set practice_id=null where id='${chart}'`);
    expect(() => context(owner)).toThrow(/pims_forbidden/);
  });
  it('fails closed on an unexpected installed language guard and rolls back the constraint change', () => {
    const definition = functionDefinition();
    // Simulate an independently changed server guard; restore it for later checks.
    sql(definition.replace(newGuard, "language_value not in ('en')"));
    const constraint = () => sql("select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.pims_drafts'::regclass and conname='pims_drafts_language_check'");
    sql("alter table public.pims_drafts drop constraint pims_drafts_language_check; alter table public.pims_drafts add constraint pims_drafts_language_check check (language in ('en','fr','de','it','es'))");
    const before = constraint();
    expect(before).not.toContain("'pl'");
    try {
      expect(() => sql(readFileSync(migrationPath, 'utf8'))).toThrow(/language guard differs from the expected definition/);
      expect(functionDefinition()).toBe(definition.replace(newGuard, "language_value not in ('en')"));
      expect(constraint()).toBe(before);
    } finally {
      sql(definition);
      sql(readFileSync(migrationPath, 'utf8'));
    }
    expect(constraint()).toContain("'pl'");
  });
  it('reapplies without altering existing drafts, receipts, function privileges or configuration', () => {
    save('en'); rpc('pims_draft_write', reviewPayload());
    const before = exportDraft();
    const receipts = sql('select jsonb_agg(to_jsonb(a) order by request_id) from public.pims_draft_actions a');
    const metadata = () => sql("select jsonb_build_object('acl',proacl,'config',proconfig,'definer',prosecdef,'definition',pg_get_functiondef(oid)) from pg_proc where oid='public.pims_draft_write(jsonb)'::regprocedure");
    const functionBefore = metadata();
    sql(readFileSync(migrationPath, 'utf8')); sql(readFileSync(migrationPath, 'utf8'));
    expect(metadata()).toBe(functionBefore);
    expect(exportDraft()).toEqual(before);
    expect(sql('select jsonb_agg(to_jsonb(a) order by request_id) from public.pims_draft_actions a')).toBe(receipts);
  });
});
