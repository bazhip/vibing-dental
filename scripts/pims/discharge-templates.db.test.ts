// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const container = process.env.PIMS_TEST_CONTAINER;
const database = 'discharge_templates_test';
const table = 'public.discharge_template_libraries';
const owner = '11111111-1111-4111-8111-111111111111';
const coOwner = '22222222-2222-4222-8222-222222222222';
const member = '33333333-3333-4333-8333-333333333333';
const outsider = '44444444-4444-4444-8444-444444444444';
const practice = '55555555-5555-4555-8555-555555555555';
const revision = '77777777-7777-4777-8777-777777777777';
const nextRevision = '88888888-8888-4888-8888-888888888888';
const templateId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const section = {
  id: 'dischargeCustom_activity', label: 'Activity', guidance: 'Include restrictions.',
  example: 'Short walks only.', suggestedText: 'Return gradually to regular activity.',
  format: 'bullets', level: 2, ownerReport: true,
};
const template = {
  id: templateId, name: 'Focused discharge', fields: [],
  sections: [{ id: 'dischargeMedications' }, { id: 'dischargeInstructions' }, { id: 'dischargeFollowUp' }, section],
  detail: 'concise', instructions: 'Use short sentences.',
};
const config = { version: 2, defaultId: templateId, templates: [template], order: ['discharge-v1', templateId] };

function sql(statement: string, db = database) {
  const args = ['exec', '-i', container!, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db];
  return execFileSync('docker', args, { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function asUser(actor: string, statement: string) {
  return sql(`begin; set local role authenticated; set local request.jwt.claim.sub='${actor}'; ${statement}; commit;`);
}

function json(value: unknown) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function insert(value: unknown) {
  return `insert into ${table} (practice_id, revision, config) values ('${practice}', '${revision}', ${json(value)}) returning revision`;
}

describe.skipIf(!container)('practice discharge template libraries', () => {
  beforeAll(() => {
    if (!container?.startsWith('toothops-pims-')) throw new Error('Use a disposable toothops-pims-* container');
    const exists = sql(`select exists (select 1 from pg_database where datname = '${database}');`, 'postgres');
    if (exists !== 't') sql(`create database ${database};`, 'postgres');
    for (const file of [
      'scripts/pims/bootstrap.sql',
      'supabase/migrations/20261215_consultation_templates.sql',
      'supabase/migrations/20261216_custom_consultation_sections.sql',
      'supabase/migrations/20261219_discharge_templates.sql',
    ]) sql(readFileSync(file, 'utf8'));
  }, 20_000);

  beforeEach(() => {
    sql(`truncate auth.users cascade;
      insert into auth.users values ('${owner}'), ('${coOwner}'), ('${member}'), ('${outsider}');
      insert into public.practices (id, owner) values ('${practice}', '${owner}');
      insert into public.practice_members (practice_id, user_id, role) values
        ('${practice}', '${owner}', 'owner'), ('${practice}', '${coOwner}', 'owner'),
        ('${practice}', '${member}', 'member');`);
  });

  it('lets practice members read and practice owners save versioned templates', () => {
    const update = `update ${table} set revision = '${nextRevision}' where revision = '${revision}' returning revision`;
    expect(() => asUser(member, insert(config))).toThrow(/row-level security/);
    expect(asUser(coOwner, insert(config))).toBe(revision);
    expect(asUser(member, `select config->>'defaultId' from ${table}`)).toBe(templateId);
    expect(asUser(outsider, `select config from ${table}`)).toBe('');
    expect(asUser(member, update)).toBe('');
    expect(asUser(owner, update)).toBe(nextRevision);
    expect(asUser(coOwner, update)).toBe('');
    expect(() => asUser(owner, `delete from ${table}`)).toThrow(/permission denied/);
  });

  it.each([
    ['missing version', { ...config, version: undefined }],
    ['duplicate ordered IDs', { ...config, order: [templateId, templateId] }],
    ['archived default', { ...config, templates: [{ ...template, archived: true }] }],
    ['nonempty legacy fields', { ...config, templates: [{ ...template, fields: ['dischargeMedications'] }] }],
    ['missing sections', { ...config, templates: [{ ...template, sections: undefined }] }],
    ['empty sections', { ...config, templates: [{ ...template, sections: [] }] }],
    ['custom section without a label', { ...config, templates: [{ ...template, sections: [{ ...section, label: undefined }] }] }],
    ['non-boolean owner report flag', { ...config, templates: [{ ...template, sections: [{ ...section, ownerReport: 'true' }] }] }],
    ['owner report flag on a standard section', { ...config, templates: [{ ...template, sections: [{ id: 'dischargeInstructions', ownerReport: true }] }] }],
  ])('rejects a library with %s', (_label, value) => {
    expect(() => asUser(owner, insert(value))).toThrow(/check constraint/);
  });

  it('rejects stale writes when the chart patient info contains a version-three Discharge layout', () => {
    const chart = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const ordinary = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const pinned = { version: 3, patientInfo: { visitType: 'dental', dischargeLayout: template } };
    const dental = { version: 1, patientInfo: { visitType: 'dental' } };
    sql(`insert into public.charts (id, created_by, data) values
      ('${chart}', '${owner}', ${json(pinned)}), ('${ordinary}', '${owner}', ${json(dental)})`);
    expect(() => sql(`update public.charts set data = ${json(dental)} where id = '${chart}'`))
      .toThrow(/Update ToothOps to save this discharge/);
    expect(sql(`update public.charts set data = data, patient_name = 'Sample' where id = '${chart}' returning data->>'version'`)).toBe('3');
    expect(sql(`update public.charts set data = ${json({ ...dental, note: 'Revised' })} where id = '${ordinary}' returning data->>'version'`)).toBe('1');
  });
});
