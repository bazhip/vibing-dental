// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const container = process.env.PIMS_TEST_CONTAINER;
const database = 'practice_note_fields_test';
const owner = '11111111-1111-4111-8111-111111111111';
const practice = '22222222-2222-4222-8222-222222222222';
const revision = '33333333-3333-4333-8333-333333333333';
const nextRevision = '44444444-4444-4444-8444-444444444444';
const consult = {
  table: 'public.consultation_template_libraries',
  starterId: 'dental-v2',
  prefix: 'consultationCustom_',
};
const discharge = {
  table: 'public.discharge_template_libraries',
  starterId: 'discharge-v1',
  prefix: 'dischargeCustom_',
};

function sql(statement: string, db = database) {
  const args = ['exec', '-i', container!, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db];
  return execFileSync('docker', args, { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function asOwner(statement: string) {
  return sql(`begin; set local role authenticated; set local request.jwt.claim.sub='${owner}'; ${statement}; commit;`);
}

function json(value: unknown) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function insert(table: string, config: unknown) {
  return `insert into ${table} (practice_id, revision, config) values ('${practice}', '${revision}', ${json(config)}) returning revision`;
}

function starter(starterId: string) {
  return { version: 2, defaultId: starterId, templates: [] };
}

describe.skipIf(!container)('practice note fields', () => {
  beforeAll(() => {
    if (!container?.startsWith('toothops-pims-')) throw new Error('Use a disposable toothops-pims-* container');
    const exists = sql(`select exists (select 1 from pg_database where datname = '${database}');`, 'postgres');
    if (exists !== 't') sql(`create database ${database};`, 'postgres');
    sql('drop schema if exists consultation_private cascade;');
    for (const file of [
      'scripts/pims/bootstrap.sql',
      'supabase/migrations/20261215_consultation_templates.sql',
      'supabase/migrations/20261216_custom_consultation_sections.sql',
      'supabase/migrations/20261219_discharge_templates.sql',
    ]) sql(readFileSync(file, 'utf8'));
    sql(`insert into auth.users values ('${owner}');
      insert into public.practices (id, owner) values ('${practice}', '${owner}');
      insert into public.practice_members (practice_id, user_id, role) values ('${practice}', '${owner}', 'owner');`);
    asOwner(insert(consult.table, { defaultId: 'dental-v1', templates: [] }));
    asOwner(insert(discharge.table, starter(discharge.starterId)));
    sql(readFileSync('supabase/migrations/20261220_practice_note_fields.sql', 'utf8'));
  }, 20_000);

  beforeEach(() => {
    sql(`truncate ${consult.table}, ${discharge.table};`);
  });

  it('preserves valid earlier configurations', () => {
    expect(asOwner(insert(consult.table, { defaultId: 'dental-v1', templates: [] }))).toBe(revision);
    expect(asOwner(insert(discharge.table, starter(discharge.starterId)))).toBe(revision);
  });

  it.each([consult, discharge])('stores practice fields in $table and protects them from stale writers', ({ table, starterId, prefix }) => {
    const base = starter(starterId);
    const field = {
      id: `${prefix}exercise`, label: 'Exercise', guidance: 'Include restrictions.', example: 'Short walks only.',
      suggestedText: 'Return gradually to regular activity.', archived: true,
    };
    expect(asOwner(insert(table, { ...base, practiceFields: [field] }))).toBe(revision);
    expect(asOwner(`select config#>>'{practiceFields,0,label}' from ${table}`)).toBe('Exercise');
    expect(() => asOwner(`update ${table} set config = ${json(base)}, revision = '${nextRevision}' where revision = '${revision}'`))
      .toThrow(/Update ToothOps to save practice note fields/);
    expect(asOwner(`update ${table} set config = ${json({ ...base, practiceFields: [] })} returning config->'practiceFields'`)).toBe('[]');
  });

  it.each([consult, discharge])('rejects invalid field lists in $table', ({ table, starterId, prefix }) => {
    const base = starter(starterId);
    const field = { id: `${prefix}exercise`, label: 'Exercise' };
    const otherPrefix = prefix === consult.prefix ? discharge.prefix : consult.prefix;
    for (const practiceFields of [
      null, {}, [field, field], [{ ...field, id: `${otherPrefix}exercise` }],
      [{ ...field, label: '\u00a0\ufeff' }], [{ ...field, example: 'a'.repeat(1001) }],
      [{ ...field, archived: 'false' }], [{ ...field, ownerReport: true }],
      Array.from({ length: 129 }, (_, index) => ({ ...field, id: `${prefix}${index}` })),
      Array.from({ length: 100 }, (_, index) => ({ ...field, id: `${prefix}${index}`, guidance: '🐾'.repeat(500) })),
    ]) {
      expect(() => asOwner(insert(table, { ...base, practiceFields }))).toThrow(/check constraint/);
    }
  });

  it('reserves the built-in dental IDs and requires version 2 when Consult includes practice fields', () => {
    const practiceFields = [{ id: 'consultationCustom_awake-oral-exam', label: 'Oral exam' }];
    expect(() => asOwner(insert(consult.table, { ...starter(consult.starterId), practiceFields }))).toThrow(/check constraint/);
    expect(() => asOwner(insert(consult.table, { defaultId: 'dental-v1', templates: [], practiceFields: [] }))).toThrow(/check constraint/);
  });
});
