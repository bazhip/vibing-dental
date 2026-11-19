// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
const container = process.env.PIMS_TEST_CONTAINER;
const first = '11111111-1111-4111-8111-111111111111', second = '22222222-2222-4222-8222-222222222222';
function sql(statement: string) {
  return execFileSync('docker', ['exec', '-i', container!, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'pims_note_mapping_test'], { input: statement, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
}
function asUser(actor: string, statement: string) { return sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${actor}';${statement};commit;`); }
const key = { provider: 'pulse', origin: 'https://clinic.evetpractice.com', template_id: 'record-note-v1' };
function rpc(name: string, input: unknown, actor = first) { return JSON.parse(asUser(actor, `select public.${name}('${JSON.stringify(input).replaceAll("'", "''")}'::jsonb)`)); }
const get = (input: unknown = key, actor = first) => rpc('pims_note_mapping_get', input, actor);
const save = (changes = {}, actor = first) => rpc('pims_note_mapping_save', { ...key, expected_version: 0, mapping: { treatment: 'Plan' }, ...changes }, actor);
describe.skipIf(!container)('owned PIMS note mappings', () => {
  beforeAll(() => {
    if (!container?.startsWith('toothops-pims-')) throw new Error('Use a disposable toothops-pims-* container');
    const maintenance = ['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'];
    const exists = execFileSync('docker', maintenance, { input: "select exists(select 1 from pg_database where datname='pims_note_mapping_test');", encoding: 'utf8' }).trim();
    if (exists !== 't') execFileSync('docker', maintenance, { input: 'create database pims_note_mapping_test;', encoding: 'utf8' });
    sql(readFileSync('scripts/pims/bootstrap.sql','utf8'));
    const migration = readFileSync('supabase/migrations/20261209_pims_note_mappings.sql','utf8');
    sql(migration); sql(migration);
  });
  beforeEach(() => { sql(`truncate auth.users cascade;insert into auth.users values('${first}'),('${second}');`); });
  it('isolates users and template/provider/origin scopes and increments versions', () => {
    expect(get()).toEqual({ ...key, version: 0, mapping: {} });
    expect(save()).toEqual({ ...key, version: 1, mapping: { treatment: 'Plan' } });
    expect(get(key, second).version).toBe(0);
    expect(get({ ...key, template_id: 'future-gp-v1' }).version).toBe(0);
    expect(get({ ...key, origin: 'https://other.evetpractice.com' }).version).toBe(0);
    expect(get({ ...key, provider: 'vetspire', origin: 'https://app.vetspire.com' }).version).toBe(0);
    expect(save({ expected_version: 1, mapping: {} }).version).toBe(2);
  });
  it('rejects stale create/update without overwriting', () => {
    save(); expect(() => save()).toThrow(/pims_conflict/);
    expect(save({ expected_version: 1 }).version).toBe(2);
    expect(() => save({ expected_version: 1, mapping: {} })).toThrow(/pims_conflict/);
    expect(get().mapping).toEqual({ treatment: 'Plan' });
  });
  it('exposes only the current user through RLS and disallows direct mutation', () => {
    save(); save({}, second);
    expect(asUser(first, 'select count(*) from public.pims_note_mappings')).toBe('1');
    for (const statement of ['delete from public.pims_note_mappings', "update public.pims_note_mappings set mapping='{}'", 'insert into public.pims_note_mappings default values']) expect(() => asUser(first, statement)).toThrow(/permission denied/);
    expect(() => sql("set role anon; select * from public.pims_note_mappings")).toThrow(/permission denied/);
    expect(() => get(key, '')).toThrow(/pims_forbidden/);
  });
  it.each([
    { origin: 'https://evil.example' }, { origin: 'https://clinic.evetpractice.com/path' }, { origin: 'https://clinic.evetpractice.com:443' },
    { origin: 'https://evetpractice.com.evil.example' }, { origin: 'http://clinic.evetpractice.com' }, { provider: 'ezyvet', origin: 'https://clinic.ezyvet.com' },
    { provider: 'vetspire' }, { template_id: 'bad id' }, { expected_version: -1 }, { expected_version: '0' },
    { mapping: { treatment: { notes: 'secret' } } }, { mapping: { 'bad id': 'Notes' } }, { mapping: { treatment: '' } },
    { mapping: { treatment: 'x'.repeat(501) } }, { mapping: { treatment: 'bad\nlabel' } }, { patient_id: 'secret' }, { notes: 'secret' },
  ])('rejects invalid input %j', changes => { expect(() => save(changes)).toThrow(/pims_invalid/); expect(get().version).toBe(0); });
  it('accepts all three supported providers and future stable template/source IDs', () => {
    for (const [provider, origin] of [['pulse','https://evetpractice.com'],['rhapsody','https://app.rhapsody.vet'],['vetspire','https://app.vetspire.com']]) {
      expect(save({ provider, origin, template_id: 'future-gp-v1', mapping: { consultationHistory: 'History', editedNote: null } }).version).toBe(1);
    }
  });
});
