// @vitest-environment node
import { readFileSync } from 'node:fs';
import { APP_LANGUAGES } from '../../src/i18n/config';

test('Hungarian and Romanian remain supported by the database client-language constraint', () => {
  const schema = readFileSync('supabase/schema.sql', 'utf8');
  const migration = readFileSync('supabase/migrations/20261202_hungarian_romanian.sql', 'utf8');
  for (const sql of [schema, migration]) {
    const constraint = sql.match(/check \(client_language is null or client_language in \(([^)]+)\)\)/)?.[1];
    expect(constraint).toBeDefined();
    for (const lng of [...APP_LANGUAGES.filter((l) => sql === schema || (l !== 'zh' && l !== 'ar')), 'pt']) expect(constraint).toContain(`'${lng}'`);
  }
  // Patch the installed function instead of replacing its patient-matching logic.
  expect(migration).toContain("pg_get_functiondef('public.send_due_reminders'::regproc)");
  expect(migration).toContain("execute definition;");
  expect(migration).toContain("if strpos(definition, old_parts[i]) = 0 then");
  expect(migration).toContain("when 'hu' then 'Az Ön állatorvosi rendelője'");
  expect(migration).toContain("when 'ro' then 'Cabinetul dumneavoastră veterinar'");
});
