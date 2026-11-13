// Writes the Supabase Auth email templates (supabase/templates/*.html and
// subjects.md) from src/locales/<lng>/authEmail.json.
// Supabase renders them with Go templates and exposes the user's metadata as
// `.Data`, so every text run is a `{{ if eq $lang "fr" }}…{{ else }}English{{ end }}`
// chain around one shared layout. A user without `language` metadata gets the
// English branch (`{{ else }}`). Pasting them into the dashboard is manual.
// `npm run i18n:check` fails when they are stale.
//   npm run i18n:emails
import { readFileSync, writeFileSync } from 'node:fs';
import { APP_LANGUAGES } from '../../src/i18n/config';
import { loadCatalogs } from './catalog';
import type { Catalogs } from './catalog';

const NS = 'authEmail';
const DIR = 'supabase/templates';
export const SUBJECTS_FILE = `${DIR}/subjects.md`;

/** Defines $lang from the user's metadata ('' when absent) — guards `eq` against a missing key. */
export const LANG_PRELUDE = '{{ $lang := "" }}{{ with .Data }}{{ with .language }}{{ $lang = . }}{{ end }}{{ end }}';

type Template = { id: string; file: string; title: string; subject: string; hasNewEmail: boolean };
const TEMPLATES: Template[] = [
  { id: 'confirmSignup', file: 'confirm-signup.html', title: 'Confirm signup', subject: 'confirmSignup.subject', hasNewEmail: false },
  { id: 'resetPassword', file: 'reset-password.html', title: 'Reset password', subject: 'resetPassword.subject', hasNewEmail: false },
  { id: 'changeEmail', file: 'change-email.html', title: 'Change email address', subject: 'changeEmail.subject', hasNewEmail: true },
];

const GO_VARS: Record<string, string> = { email: '{{ .Email }}', newEmail: '{{ .NewEmail }}' };
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A catalog string as HTML: text escaped, <strong> kept, {{var}} turned into the Go placeholder. */
function toHtml(text: string): string {
  return text
    .split(/(<\/?strong>|\{\{\s*\w+\s*\}\})/)
    .map((part, i) => {
      if (i % 2 === 0) return escapeHtml(part);
      if (part.startsWith('<')) return part;
      const name = part.replace(/[{}\s]/g, '');
      if (!(name in GO_VARS)) throw new Error(`authEmail: unknown placeholder ${part}`);
      return GO_VARS[name];
    })
    .join('');
}

/** A catalog string as plain text (subject): {{var}} turned into the Go placeholder. */
function toText(text: string): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => {
    if (!(name in GO_VARS)) throw new Error(`authEmail: unknown placeholder {{${name}}}`);
    return GO_VARS[name];
  });
}

/** `{{ if eq $lang "fr" }}…{{ else }}English{{ end }}`; English is the fallback branch. */
function chain(byLng: (lng: string) => string): string {
  const others = APP_LANGUAGES.filter((l) => l !== 'en');
  return (
    others.map((l, i) => `{{ ${i === 0 ? 'if' : 'else if'} eq $lang "${l}" }}${byLng(l)}`).join('') +
    `{{ else }}${byLng('en')}{{ end }}`
  );
}

export function generateAuthTemplates(catalogs: Catalogs): Record<string, string> {
  const en = catalogs.en?.[NS] ?? {};
  // A missing translation falls back to English (i18n:check reports it anyway).
  const str = (lng: string, key: string) => catalogs[lng]?.[NS]?.[key] ?? en[key];
  const out: Record<string, string> = {};

  for (const tpl of TEMPLATES) {
    const run = (key: string) => chain((lng) => toHtml(str(lng, key)));
    const k = (name: string) => `${tpl.id}.${name}`;
    out[`${DIR}/${tpl.file}`] = `${LANG_PRELUDE}<!doctype html>
<html lang="${chain((l) => l)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${run(k('title'))}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#17232e;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${run(k('preheader'))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f7;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
      <tr><td style="padding:28px 32px 8px;">
        <div style="font-size:20px;font-weight:700;color:#0c6b63;letter-spacing:-0.01em;">ToothOps</div>
      </td></tr>
      <tr><td style="padding:8px 32px 0;">
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#17232e;">${run(k('title'))}</h1>
        <p style="margin:0;font-size:16px;line-height:1.55;">${run(k('body'))}</p>
      </td></tr>
      <tr><td style="padding:20px 32px 8px;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#0c6b63;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:12px 22px;border-radius:8px;">${run(k('button'))}</a>
      </td></tr>
      <tr><td style="padding:12px 32px 28px;font-size:13px;line-height:1.5;color:#64748b;">
        ${run('common.fallback')}<br>
        <a href="{{ .ConfirmationURL }}" style="color:#0c6b63;word-break:break-all;">{{ .ConfirmationURL }}</a>
        <p style="margin:16px 0 0;">${run(k('ignore'))}</p>
      </td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">ToothOps · ${run('common.tagline')} · <a href="https://toothops.app" style="color:#94a3b8;">toothops.app</a></p>
  </td></tr>
</table>
</body>
</html>
`;
  }

  const sections = TEMPLATES.map((tpl) => {
    const subjectField = LANG_PRELUDE + chain((lng) => toText(str(lng, tpl.subject)));
    const rows = APP_LANGUAGES.map((lng) => `| ${lng} | ${toText(str(lng, tpl.subject))} |`).join('\n');
    return `## ${tpl.title} (\`${tpl.file}\`)

Paste into the Subject heading field:

\`\`\`
${subjectField}
\`\`\`

| Language | Subject |
|---|---|
${rows}
`;
  });
  out[SUBJECTS_FILE] = `<!-- Generated — run npm run i18n:emails. Do not edit by hand. -->
# Auth email subjects

Source: \`src/locales/<lng>/authEmail.json\`. Supabase's Subject heading field accepts
Go templates, so each subject below picks the user's language from their
\`language\` metadata and falls back to English. Paste each block into
Dashboard → Authentication → Emails → Templates, next to its body (see README.md).

${sections.join('\n')}`;
  return out;
}

/** Messages for i18n:check: one per committed template that is missing or out of date. */
export function authTemplatesProblems(catalogs: Catalogs): string[] {
  const problems: string[] = [];
  for (const [file, content] of Object.entries(generateAuthTemplates(catalogs))) {
    let current = '';
    try {
      current = readFileSync(file, 'utf8');
    } catch {
      /* missing → stale */
    }
    if (current !== content) problems.push(`${file} is out of date with src/locales/*/authEmail.json — run \`npm run i18n:emails\``);
  }
  return problems;
}

// Run only as a CLI, not when imported by tests.
if (process.argv[1]?.endsWith('gen-auth-templates.ts')) {
  for (const [file, content] of Object.entries(generateAuthTemplates(loadCatalogs()))) {
    writeFileSync(file, content);
    console.log(`wrote ${file}`);
  }
}
