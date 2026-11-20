// @vitest-environment node
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const container = process.env.PIMS_TEST_CONTAINER;
const database = 'consultation_templates_test';
const table = 'public.consultation_template_libraries';
const owner = '11111111-1111-4111-8111-111111111111';
const coOwner = '22222222-2222-4222-8222-222222222222';
const member = '33333333-3333-4333-8333-333333333333';
const outsider = '44444444-4444-4444-8444-444444444444';
const practice = '55555555-5555-4555-8555-555555555555';
const otherPractice = '66666666-6666-4666-8666-666666666666';
const firstRevision = '77777777-7777-4777-8777-777777777777';
const secondRevision = '88888888-8888-4888-8888-888888888888';
const thirdRevision = '99999999-9999-4999-8999-999999999999';
const templateId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const template = {
  id: templateId,
  name: 'Focused consultation',
  fields: [
    'complaint', 'consultationHistory', 'gpVitals', 'gpPhysicalExam',
    'gpDiagnostics', 'consultationAssessment', 'consultationPlan',
  ],
};
const config = { defaultId: templateId, templates: [template] };

function args(db = database) {
  return ['exec', '-i', container!, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db];
}

function sql(statement: string, db = database) {
  return execFileSync('docker', args(db), { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function transaction(actor: string, statement: string) {
  return `begin; set local role authenticated; set local request.jwt.claim.sub='${actor}'; ${statement}; commit;`;
}

function asUser(actor: string, statement: string) {
  return sql(transaction(actor, statement));
}

function concurrently(actor: string, statement: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile('docker', args(), (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
    child.stdin!.end(transaction(actor, statement));
  });
}

function insert(value: unknown, practiceId = practice, revision = firstRevision) {
  const json = JSON.stringify(value).replaceAll("'", "''");
  return `insert into ${table} (practice_id, revision, config) values ('${practiceId}', '${revision}', '${json}'::jsonb) returning revision`;
}

function update(revision: string, expected = firstRevision) {
  return `update ${table} set revision = '${revision}' where practice_id = '${practice}' and revision = '${expected}' returning revision`;
}

describe.skipIf(!container)('practice consultation template libraries', () => {
  beforeAll(() => {
    if (!container?.startsWith('toothops-pims-')) throw new Error('Use a disposable toothops-pims-* container');
    const exists = sql(`select exists (select 1 from pg_database where datname = '${database}');`, 'postgres');
    if (exists !== 't') sql(`create database ${database};`, 'postgres');
    sql(readFileSync('scripts/pims/bootstrap.sql', 'utf8'));
    sql(readFileSync('supabase/migrations/20261215_consultation_templates.sql', 'utf8'));
    sql(readFileSync('supabase/migrations/20261216_custom_consultation_sections.sql', 'utf8'));
  }, 20_000);

  beforeEach(() => {
    sql(`truncate auth.users cascade;
      insert into auth.users values ('${owner}'), ('${coOwner}'), ('${member}'), ('${outsider}');
      insert into public.practices (id, owner) values ('${practice}', '${owner}'), ('${otherPractice}', '${outsider}');
      insert into public.practice_members (practice_id, user_id, role) values
        ('${practice}', '${owner}', 'owner'), ('${practice}', '${coOwner}', 'owner'),
        ('${practice}', '${member}', 'member'), ('${otherPractice}', '${outsider}', 'owner');`);
  });

  it('lets both practice owners write and ordinary members read their own practice only', () => {
    expect(asUser(coOwner, insert(config))).toBe(firstRevision);
    expect(asUser(owner, update(secondRevision))).toBe(secondRevision);
    expect(asUser(member, `select config->>'defaultId' from ${table}`)).toBe(templateId);
    expect(asUser(member, update(thirdRevision, secondRevision))).toBe('');
    expect(asUser(outsider, `select revision from ${table}`)).toBe('');
    expect(() => asUser(outsider, insert(config))).toThrow(/row-level security/);
    expect(() => asUser(member, insert(config, otherPractice))).toThrow(/row-level security/);
    expect(() => sql(`set role anon; select config from ${table}`)).toThrow(/permission denied/);
  });

  it('accepts ordered custom sections and rejects unsupported or duplicate fields', () => {
    const section = { id: 'consultationCustom_oral', label: 'Oral findings', format: 'bullets', level: 2 };
    const layout = { ...template, sections: [section], detail: 'concise', instructions: 'Use short sentences.' };
    const next = { defaultId: 'dental-v2', templates: [layout], order: [templateId, 'dental-v2'] };
    expect(asUser(owner, insert(next))).toBe(firstRevision);
    const valid = (value: unknown) => asUser(owner, `select consultation_private.valid_template_library('${JSON.stringify(value)}'::jsonb)`);
    for (const sections of [[{ id: 'patientName' }], [section, section], [{ ...section, label: '' }], [{ ...section, level: 3 }]]) {
      expect(valid({ ...next, templates: [{ ...layout, sections }] })).toBe('f');
    }
    expect(valid({ ...next, order: [templateId, templateId] })).toBe('f');
  });

  it('rejects old template writers even when they hold the latest revision', () => {
    const put = (value: unknown) => `update ${table} set config = '${JSON.stringify(value)}'::jsonb where practice_id = '${practice}' and revision = '${firstRevision}' returning revision`;
    const modern = { ...config, version: 2 };
    expect(asUser(owner, insert(modern))).toBe(firstRevision);
    expect(() => asUser(owner, put({ ...config, defaultId: 'soap-v1' })))
      .toThrow(/Update ToothOps to save consultation templates/);
    expect(asUser(owner, put({ ...modern, defaultId: 'dental-v2' }))).toBe(firstRevision);
  });

  it('prevents version-one clients from overwriting version-two consultation snapshots', () => {
    const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const original = { version: 2, patientInfo: { visitType: 'consultation', consultationCustom_oral: 'Finding' } };
    sql(`insert into public.charts (id, created_by, data) values ('${id}', '${owner}', '${JSON.stringify(original)}')`);
    expect(() => sql(`update public.charts set data = jsonb_set(data, '{version}', '1') where id = '${id}'`))
      .toThrow(/Update ToothOps to save this consultation/);
    expect(sql(`update public.charts set patient_name = 'Sample', data = data where id = '${id}' returning data->>'version'`)).toBe('2');
    expect(sql(`update public.charts set data = jsonb_set(data, '{patientInfo,consultationCustom_oral}', '"Revised"') where id = '${id}' returning data#>>'{patientInfo,consultationCustom_oral}'`)).toBe('Revised');
  });

  it('revokes library access when a co-owner leaves the practice', () => {
    asUser(owner, insert(config));
    sql(`delete from public.practice_members where practice_id = '${practice}' and user_id = '${coOwner}'`);
    expect(asUser(coOwner, `select revision from ${table}`)).toBe('');
    expect(asUser(coOwner, update(secondRevision))).toBe('');
    expect(() => asUser(coOwner, insert(config))).toThrow(/row-level security/);
  });

  it('keeps practice identity immutable and disallows direct deletion', () => {
    asUser(owner, insert(config));
    expect(() => asUser(owner, `update ${table} set practice_id = '${otherPractice}'`)).toThrow(/permission denied/);
    expect(() => asUser(owner, `delete from ${table}`)).toThrow(/permission denied/);
    expect(asUser(owner, `select practice_id from ${table}`)).toBe(practice);
  });

  it('allows only one concurrent first insert', async () => {
    const outcomes = await Promise.allSettled([
      concurrently(owner, insert(config)),
      concurrently(coOwner, insert(config, practice, secondRevision)),
    ]);
    const successes = outcomes.filter(result => result.status === 'fulfilled');
    const failures = outcomes.filter(result => result.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(String(failures[0].reason)).toMatch(/duplicate key/);
    expect(asUser(member, `select revision from ${table}`)).toBe(successes[0].value);
  });

  it('allows only one concurrent update against a saved revision', async () => {
    asUser(owner, insert(config));
    const outcomes = await Promise.all([
      concurrently(owner, update(secondRevision)),
      concurrently(coOwner, update(thirdRevision)),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(asUser(member, `select revision from ${table}`)).toBe(outcomes.find(Boolean));
  });

  it.each([
    ['non-object library', []],
    ['missing default', { templates: [] }],
    ['missing template list', { defaultId: 'dental-v1' }],
    ['object template list', { defaultId: 'dental-v1', templates: {} }],
    ['unknown default', { defaultId: 'unknown-v1', templates: [] }],
    ['archived default', { ...config, templates: [{ ...template, archived: true }] }],
    ['duplicate template IDs', { ...config, templates: [template, template] }],
    ['non-boolean archive value', { ...config, templates: [{ ...template, archived: 'false' }] }],
    ['missing field', { ...config, templates: [{ ...template, fields: template.fields.slice(1) }] }],
    ['duplicate field', { ...config, templates: [{ ...template, fields: [...template.fields.slice(1), 'gpVitals'] }] }],
    ['unrecognized clinical data', { ...config, templates: [{ ...template, note: 'synthetic note' }] }],
    ['non-breaking-space-only name', { ...config, templates: [{ ...template, name: '\u00a0' }] }],
    ['byte-order-mark-only name', { ...config, templates: [{ ...template, name: '\ufeff' }] }],
    ['oversized name', { ...config, templates: [{ ...template, name: 'x'.repeat(101) }] }],
    ['oversized library', { ...config, templates: Array.from({ length: 25 }, (_, index) => ({
      ...template, id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`,
    })) }],
  ])('rejects %s before storing it', (_label, value) => {
    expect(() => asUser(owner, insert(value))).toThrow(/check constraint/);
    expect(asUser(owner, `select revision from ${table}`)).toBe('');
  });

  it('accepts the editor’s 100-code-point limit for Unicode names', () => {
    const name = '\u00a0' + '🐾'.repeat(98) + '\ufeff';
    expect(asUser(owner, insert({ ...config, templates: [{ ...template, name }] }))).toBe(firstRevision);
  });
});
