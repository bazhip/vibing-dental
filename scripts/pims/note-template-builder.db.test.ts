// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const container = process.env.PIMS_TEST_CONTAINER;
const database = 'note_template_builder_test';
const owner = '11111111-1111-4111-8111-111111111111';
const practice = '22222222-2222-4222-8222-222222222222';
const revision = '33333333-3333-4333-8333-333333333333';
const chart = '44444444-4444-4444-8444-444444444444';
const consultTable = 'public.consultation_template_libraries';
const dischargeTable = 'public.discharge_template_libraries';
const consultFields = ['complaint', 'consultationHistory', 'consultationAssessment', 'consultationPlan', 'gpVitals', 'gpPhysicalExam', 'gpDiagnostics'];

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

function template(id: string, discharge: boolean, sections: unknown[], name = 'Edited template') {
  return { id, name, fields: discharge ? [] : consultFields, sections };
}

describe.skipIf(!container)('note template builder', () => {
  beforeAll(() => {
    if (!container?.startsWith('toothops-pims-')) throw new Error('Use a disposable toothops-pims-* container');
    const exists = sql(`select exists (select 1 from pg_database where datname = '${database}');`, 'postgres');
    if (exists !== 't') sql(`create database ${database};`, 'postgres');
    sql('drop schema if exists consultation_private cascade;');
    for (const file of [
      'scripts/pims/bootstrap.sql',
      'supabase/migrations/20261215_consultation_templates.sql',
      'supabase/migrations/20261216_custom_consultation_sections.sql',
      'supabase/migrations/20261222_discharge_templates.sql',
      'supabase/migrations/20261223_practice_note_fields.sql',
    ]) sql(readFileSync(file, 'utf8'));
    sql(`insert into auth.users values ('${owner}');
      insert into public.practices (id, owner) values ('${practice}', '${owner}');
      insert into public.practice_members (practice_id, user_id, role) values ('${practice}', '${owner}', 'owner');`);
    asOwner(insert(consultTable, { defaultId: 'dental-v1', templates: [] }));
    asOwner(insert(dischargeTable, { version: 2, defaultId: 'discharge-v1', templates: [] }));
    sql(readFileSync('supabase/migrations/20261227_note_template_builder.sql', 'utf8'));
    sql(readFileSync('supabase/migrations/20261228_note_template_images.sql', 'utf8'));
  }, 40_000);

  beforeEach(() => {
    sql(`truncate ${consultTable}, ${dischargeTable}, public.charts;`);
  });

  it('upgrades existing layouts and validates image placement', () => {
    const legacy = { version: 2, defaultId: 'dental-v2', templates: [] };
    asOwner(insert(consultTable, legacy));
    const gallery = { ...template('dental-v2', false, [{ id: 'complaint' }]), imagePlacement: { index: 0, label: 'Radiographs' } };
    const updated = { ...legacy, version: 4, templates: [gallery] };
    const update = (config: unknown) => asOwner(`update ${consultTable} set config = ${json(config)} returning config->>'version'`);
    expect(update(updated)).toBe('4');
    expect(() => update({ ...updated, version: 3 })).toThrow();
    expect(() => update({ ...updated, templates: [{ ...gallery, imagePlacement: { index: 2 } }] })).toThrow();
    expect(update({ ...updated, templates: [{ ...gallery, imagePlacement: false }] })).toBe('4');
  });

  it('continues to accept legacy Consult and Discharge libraries', () => {
    expect(asOwner(insert(consultTable, { defaultId: 'dental-v1', templates: [] }))).toBe(revision);
    expect(asOwner(insert(dischargeTable, { version: 2, defaultId: 'discharge-v1', templates: [] }))).toBe(revision);
  });

  it('supports editing and removing Consult starters while enforcing a valid practice default', () => {
    const dental = template('dental-v2', false, [{ id: 'complaint' }], 'Dental consultation');
    const soap = template('soap-v1', false, [{ id: 'gpDiagnostics' }], 'Clinic SOAP');
    const legacy = template('dental-v1', false, [{ id: 'gpPhysicalExam' }]);
    const recheck = template('recheck-v1', false, [{ id: 'consultationPlan' }]);
    const builtins = [dental, soap, legacy, { ...recheck, archived: true }];
    const custom = Array.from({ length: 24 }, (_, index) =>
      template(`aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`, false, [{ id: 'complaint' }]));
    const config = { version: 3, defaultId: soap.id, templates: [...builtins, ...custom] };
    expect(() => asOwner(insert(consultTable, { ...config, version: 2 }))).toThrow(/check constraint/);
    expect(() => asOwner(insert(consultTable, { ...config, defaultId: recheck.id }))).toThrow(/check constraint/);
    expect(() => asOwner(insert(consultTable, { ...config, templates: [...config.templates, {
      ...custom[0], id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    }] }))).toThrow(/check constraint/);
    expect(asOwner(insert(consultTable, config))).toBe(revision);
    expect(asOwner(`select config#>>'{templates,1,name}' from ${consultTable}`)).toBe('Clinic SOAP');
  });

  it.each([
    { table: consultTable, discharge: false, starter: 'dental-v2', id: 'consultationCustom_care' },
    { table: dischargeTable, discharge: true, starter: 'discharge-v1', id: 'dischargeCustom_care' },
  ])('persists structured sections and reusable fields in $table', ({ table, discharge, starter, id }) => {
    const field = { id, label: 'Care preferences', inputType: 'multiselect', options: ['Email', 'Phone'] };
    const layout = template('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', discharge, [field]);
    const config = { version: 3, defaultId: starter, templates: [layout], practiceFields: [field] };
    expect(asOwner(insert(table, config))).toBe(revision);
    expect(asOwner(`select config#>>'{templates,0,sections,0,options,1}' from ${table}`)).toBe('Phone');
    expect(asOwner(`select config#>>'{practiceFields,0,inputType}' from ${table}`)).toBe('multiselect');
    expect(() => asOwner(`update ${table} set config = ${json({
      version: 2, defaultId: starter, templates: [], practiceFields: [],
    })}`)).toThrow(/Update ToothOps to save note templates/);
  });

  it('rejects invalid inputs, unsafe options, and typed structured clinical sections', () => {
    const base = { version: 3, defaultId: 'dental-v2' };
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const field = { id: 'consultationCustom_choices', label: 'Follow-up channel' };
    const invalid = [
      { inputType: 'dropdown', options: ['Phone'] },
      { inputType: 'radio' },
      { inputType: 'radio', options: 'Phone' },
      { inputType: 'radio', options: ['Phone', 'Phone'] },
      { inputType: 'radio', options: [' Phone'] },
      { inputType: 'radio', options: [''] },
      { inputType: 'radio', options: ['Call\nMonday'] },
      { inputType: 'radio', options: ['x'.repeat(101)] },
      { inputType: 'radio', options: Array.from({ length: 21 }, (_, n) => String(n)) },
      { inputType: 'shortText', options: [] },
      { options: ['Phone'] },
    ];
    for (const metadata of invalid) {
      const section = { ...field, ...metadata };
      const layout = template(id, false, [section]);
      expect(() => asOwner(insert(consultTable, { ...base, templates: [layout] }))).toThrow(/check constraint/);
      expect(() => asOwner(insert(consultTable, { ...base, templates: [], practiceFields: [section] }))).toThrow(/check constraint/);
    }
    for (const sectionId of ['gpVitals', 'consultationMedicationPlan', 'consultationCurrentMedications', 'consultationAdministeredMedications']) {
      const layout = template(id, false, [{ id: sectionId, inputType: 'shortText' }]);
      expect(() => asOwner(insert(consultTable, { ...base, templates: [layout] }))).toThrow(/check constraint/);
    }
    expect(asOwner(insert(consultTable, { ...base, templates: [template(id, false, [{ ...field, inputType: 'shortText' }])] }))).toBe(revision);
  }, 20_000);

  it.each([
    { kind: 'consultation', version: 3, patientInfo: { visitType: 'consultation' } },
    { kind: 'discharge', version: 4, patientInfo: { dischargeLayout: { id: 'discharge-v1' } } },
  ])('rejects stale serializers on saved $kind snapshots', ({ kind, version, patientInfo }) => {
    sql(`insert into public.charts (id, created_by, data) values
      ('${chart}', '${owner}', ${json({ version, patientInfo })})`);
    expect(() => sql(`update public.charts set data = jsonb_set(data, '{version}', '${version - 1}') where id = '${chart}'`))
      .toThrow(new RegExp(`Update ToothOps to save this ${kind}`));
    expect(sql(`update public.charts set data = data || '{"unrelated":"changed"}'
      where id = '${chart}' returning data->>'version'`)).toBe(String(version));
  });
});
