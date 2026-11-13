// @vitest-environment node
// Supabase Auth email templates are generated from src/locales/<lng>/authEmail.json.
import { readFileSync } from 'node:fs';
import { APP_LANGUAGES } from '../../src/i18n/config';
import { loadCatalogs } from './catalog';
import { authTemplatesProblems, generateAuthTemplates, LANG_PRELUDE } from './gen-auth-templates';

const catalogs = loadCatalogs();
const FILES = ['confirm-signup', 'reset-password', 'change-email'];
const read = (f: string) => readFileSync(`supabase/templates/${f}.html`, 'utf8');
const original = (f: string) => readFileSync(`scripts/i18n/fixtures/auth-templates/${f}.html`, 'utf8');
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Minimal evaluator for the only Go-template shapes the generator emits. */
function render(src: string, lng: string): string {
  return src
    .replace(LANG_PRELUDE, '')
    .replace(/\{\{ if eq \$lang "\w+" \}\}[\s\S]*?\{\{ end \}\}/g, (chain) => {
      const parts = chain.split(/\{\{ (?:else if eq \$lang "(\w+)"|else) \}\}/);
      // parts: [ifBody(+if tag stripped below), lng1?, body1, ..., undefined, elseBody]
      const first = /^\{\{ if eq \$lang "(\w+)" \}\}/.exec(parts[0])!;
      const branches: [string | undefined, string][] = [[first[1], parts[0].slice(first[0].length)]];
      for (let i = 1; i < parts.length; i += 2) branches.push([parts[i], parts[i + 1].replace(/\{\{ end \}\}$/, '')]);
      const hit = branches.find(([l]) => l === lng) ?? branches[branches.length - 1];
      return hit[1];
    });
}

describe('generated Supabase auth templates', () => {
  test('are current: generating from the catalogs reproduces the committed files', () => {
    expect(authTemplatesProblems(catalogs)).toEqual([]);
  });

  test('the prelude is nil-safe and coerces non-string metadata', () => {
    expect(LANG_PRELUDE).toContain('printf "%v" .');
  });

  test.each(FILES)('%s: the English branch equals today’s template', (f) => {
    expect(normalize(render(read(f), 'en'))).toBe(normalize(original(f)));
  });

  test.each(FILES)('%s: a missing or unknown language renders English', (f) => {
    expect(render(read(f), '')).toBe(render(read(f), 'en'));
    expect(render(read(f), 'xx')).toBe(render(read(f), 'en'));
  });

  test.each(FILES)('%s: every language keeps the Go placeholders and the layout', (f) => {
    const placeholders = (s: string) => (s.match(/\{\{ \.\w+ \}\}/g) ?? []).sort();
    const en = render(read(f), 'en');
    for (const lng of APP_LANGUAGES) {
      const out = render(read(f), lng);
      expect(placeholders(out)).toEqual(placeholders(en));
      expect(out).not.toMatch(/\{\{ (if|else|end)|\$lang/);
      expect(out.replace(/>[^<]*</g, '><')).toBe(en.replace('<html lang="en">', `<html lang="${lng}">`).replace(/>[^<]*</g, '><'));
    }
  });

  test('a translated branch differs from English and sets <html lang>', () => {
    const fr = render(read('reset-password'), 'fr');
    expect(fr).toContain('<html lang="fr">');
    expect(fr).toContain('Réinitialisez votre mot de passe');
    expect(fr).not.toContain('Reset your password');
  });

  test('HTML-escapes translations but keeps <strong> and placeholders', () => {
    const files = generateAuthTemplates(catalogs);
    const signup = files['supabase/templates/confirm-signup.html'];
    expect(signup).toContain('Confirm email &amp; sign in');
    expect(signup).toContain('E-Mail bestätigen &amp; anmelden');
    expect(signup).toContain('<strong>{{ .Email }}</strong>');
    const change = files['supabase/templates/change-email.html'];
    expect(change).toContain('<strong>{{ .NewEmail }}</strong>');
  });

  test('subjects.md lists every language’s subject, English as the fallback', () => {
    const md = readFileSync('supabase/templates/subjects.md', 'utf8');
    for (const lng of APP_LANGUAGES) {
      expect(md).toContain(`| ${lng} | ${catalogs[lng].authEmail['resetPassword.subject']} |`);
    }
    expect(md).toContain('{{ else }}Reset your ToothOps password{{ end }}');
  });
});
