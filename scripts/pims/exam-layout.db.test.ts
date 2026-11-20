// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_EXAM_LAYOUT, EXAM_LAYOUT_LIMIT } from '../../src/utils/examLayout';

const container = process.env.PIMS_TEST_CONTAINER;
const database = 'exam_layout_test';
const table = 'public.exam_layouts';
const owner = '11111111-1111-4111-8111-111111111111';
const coOwner = '22222222-2222-4222-8222-222222222222';
const member = '33333333-3333-4333-8333-333333333333';
const outsider = '44444444-4444-4444-8444-444444444444';
const practice = '55555555-5555-4555-8555-555555555555';
const revision = '66666666-6666-4666-8666-666666666666';
const nextRevision = '77777777-7777-4777-8777-777777777777';
const layout = [
  { id: 'gpDiagnostics', kind: 'text', label: 'Test results' },
  { id: 'exam-text-airway', kind: 'text', label: 'Airway risk' },
  { id: 'tongue', kind: 'area' },
  { id: 'xlegacy', kind: 'area', label: "Dentist's area" },
];

function sql(statement: string, db = database) {
  return execFileSync('docker', ['exec', '-i', container!, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db], {
    input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function asUser(actor: string, statement: string) {
  return sql(`begin; set local role authenticated; set local request.jwt.claim.sub='${actor}'; ${statement}; commit;`);
}

const jsonb = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;

describe.skipIf(!container)('practice Exam layouts', () => {
  beforeAll(() => {
    if (!container?.startsWith('toothops-pims-')) throw new Error('Use a disposable toothops-pims-* container');
    const present = sql(`select exists (select 1 from pg_database where datname = '${database}');`, 'postgres');
    if (present !== 't') sql(`create database ${database};`, 'postgres');
    sql('drop schema if exists consultation_private cascade;');
    for (const file of [
      'scripts/pims/bootstrap.sql',
      'supabase/migrations/20261215_consultation_templates.sql',
      'supabase/migrations/20261225_exam_layouts.sql',
    ]) sql(readFileSync(file, 'utf8'));
    sql(`insert into auth.users values ('${owner}'), ('${coOwner}'), ('${member}'), ('${outsider}');
      insert into public.practices (id, owner) values ('${practice}', '${owner}');
      insert into public.practice_members (practice_id, user_id, role) values
        ('${practice}', '${owner}', 'owner'), ('${practice}', '${coOwner}', 'owner'),
        ('${practice}', '${member}', 'member');`);
  }, 20_000);

  it('lets members read the practice fields and only owners write them', () => {
    const insert = `insert into ${table} (practice_id, revision, fields) values
      ('${practice}', '${revision}', ${jsonb(layout)}) returning revision`;
    const update = `update ${table} set revision = '${nextRevision}' where revision = '${revision}' returning revision`;
    expect(() => asUser(member, insert)).toThrow(/row-level security/);
    expect(asUser(coOwner, insert)).toBe(revision);
    expect(asUser(member, `select fields->1->>'label' from ${table}`)).toBe('Airway risk');
    expect(asUser(outsider, `select fields from ${table}`)).toBe('');
    expect(asUser(member, update)).toBe('');
    expect(asUser(owner, update)).toBe(nextRevision);
    expect(asUser(coOwner, update)).toBe('');
  });

  it('validates stable IDs, field kinds, names and layout size', () => {
    const valid = (fields: unknown) => sql(`select consultation_private.valid_exam_layout(${jsonb(fields)});`);
    expect(valid(DEFAULT_EXAM_LAYOUT)).toBe('t');
    expect(valid(layout)).toBe('t');
    expect(valid([])).toBe('t');
    for (const fields of [
      {}, [null], [layout[1], layout[1]], [{ ...layout[0], kind: 'area' }],
      [{ ...layout[1], label: '\u00a0' }], [{ ...layout[1], kind: 'area' }],
      [{ ...layout[1], label: 'x'.repeat(61) }], [{ ...layout[1], extra: true }],
      Array.from({ length: EXAM_LAYOUT_LIMIT + 1 }, (_, index) => ({ ...layout[1], id: `exam-text-${index}` })),
    ]) expect(valid(fields)).toBe('f');
  });
});
