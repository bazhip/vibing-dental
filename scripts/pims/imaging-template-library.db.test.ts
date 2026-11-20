// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const container = process.env.PIMS_TEST_CONTAINER;
const database = 'imaging_template_library_test';
const table = 'public.imaging_template_libraries';
const owner = '11111111-1111-4111-8111-111111111111';
const coOwner = '22222222-2222-4222-8222-222222222222';
const member = '33333333-3333-4333-8333-333333333333';
const outsider = '44444444-4444-4444-8444-444444444444';
const practice = '55555555-5555-4555-8555-555555555555';
const revision = '66666666-6666-4666-8666-666666666666';
const nextRevision = '77777777-7777-4777-8777-777777777777';
const templateId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const starter = { version: 2, defaultId: 'imaging-v1', templates: [] };
const technique = { id: 'consultationCustom_imaging-technique' };
const findings = { id: 'consultationCustom_imaging-findings' };
const impression = { id: 'consultationCustom_imaging-impression' };
const field = { id: 'consultationCustom_comparison', label: 'Comparison', guidance: 'Describe earlier studies.' };
const template = {
  id: templateId, name: 'Follow-up imaging', fields: [],
  sections: [technique, { ...field, level: 2, format: 'paragraph' }, findings, impression],
  detail: 'concise', instructions: 'Use short sentences.',
};
const config = { ...starter, defaultId: templateId, templates: [template], order: [templateId, 'imaging-v1'], practiceFields: [field] };

function sql(statement: string, db = database) {
  const args = ['exec', '-i', container!, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db];
  return execFileSync('docker', args, { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function asUser(actor: string, statement: string) {
  return sql(`begin; set local role authenticated; set local request.jwt.claim.sub='${actor}'; ${statement}; commit;`);
}

function insert(value: unknown) {
  const json = JSON.stringify(value).replaceAll("'", "''");
  return `insert into ${table} (practice_id, revision, config) values ('${practice}', '${revision}', '${json}'::jsonb) returning revision`;
}

describe.skipIf(!container)('practice Imaging template libraries', () => {
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
      'supabase/migrations/20261220_practice_note_fields.sql',
      'supabase/migrations/20261221_imaging_template_library.sql',
    ]) sql(readFileSync(file, 'utf8'));
    sql(`insert into auth.users values ('${owner}'), ('${coOwner}'), ('${member}'), ('${outsider}');
      insert into public.practices (id, owner) values ('${practice}', '${owner}');
      insert into public.practice_members (practice_id, user_id, role) values
        ('${practice}', '${owner}', 'owner'), ('${practice}', '${coOwner}', 'owner'),
        ('${practice}', '${member}', 'member');`);
  }, 20_000);

  beforeEach(() => {
    sql(`truncate ${table};`);
  });

  it('lets owners save starter libraries', () => {
    expect(asUser(owner, insert(starter))).toBe(revision);
  });

  it('lets members read and co-owners save ordered outlines with shared fields', () => {
    const update = `update ${table} set revision = '${nextRevision}' where revision = '${revision}' returning revision`;
    expect(() => asUser(member, insert(config))).toThrow(/row-level security/);
    expect(asUser(coOwner, insert(config))).toBe(revision);
    expect(asUser(member, `select config#>>'{practiceFields,0,label}' from ${table}`)).toBe('Comparison');
    expect(asUser(outsider, `select config from ${table}`)).toBe('');
    expect(asUser(member, update)).toBe('');
    expect(asUser(owner, update)).toBe(nextRevision);
    expect(asUser(coOwner, update)).toBe('');
  });

  it('rejects invalid outline and shared field definitions', () => {
    const withSections = (sections: unknown) => ({ ...config, templates: [{ ...template, sections }] });
    const invalid = [
      { ...config, version: undefined }, { ...config, order: [templateId, templateId] },
      withSections([]), withSections([technique, technique]),
      withSections([{ ...field, label: undefined }]), withSections([{ ...findings, ownerReport: true }]),
      withSections([{ id: 'dischargeCustom_imaging-findings', label: 'Findings' }]),
      { ...config, practiceFields: [{ ...technique, label: 'Technique' }] },
      { ...config, practiceFields: [{ ...field, archived: 'true' }] },
      { ...config, practiceFields: [{ ...field, format: 'paragraph' }] },
      { ...config, practiceFields: [field, field] },
      { ...config, practiceFields: Array.from({ length: 129 }, (_, index) => ({ ...field, id: `consultationCustom_section-${index}` })) },
      { ...config, practiceFields: Array.from({ length: 100 }, (_, index) => ({
        ...field, id: `consultationCustom_section-${index}`, suggestedText: '🐾'.repeat(500),
      })) },
    ];
    for (const value of invalid) {
      expect(() => asUser(owner, insert(value))).toThrow(/check constraint/);
    }
  });

  it.each([
    'consultationCustom_awake-oral-exam', 'consultationCustom_preanesthetic',
    'consultationCustom_client-discussion', 'consultationCustom_home-care', 'consultationCustom_follow-up',
  ])('rejects the reserved Consult ID %s in Imaging', (id) => {
    const dentalField = { id, label: 'Dental section' };
    expect.soft(() => asUser(owner, insert({ ...config, templates: [{ ...template, sections: [dentalField] }] }))).toThrow(/check constraint/);
    expect.soft(() => asUser(owner, insert({ ...config, practiceFields: [dentalField] }))).toThrow(/check constraint/);
  });
});
