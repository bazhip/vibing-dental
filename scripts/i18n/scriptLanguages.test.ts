// @vitest-environment node
import { readFileSync } from 'node:fs';
import { checkCatalogs } from './check';
import { loadCatalogs, loadMeta } from './catalog';
import { renderBrandedEmail } from '../../supabase/functions/_shared/email';
import { EMAIL_LANGUAGES } from '../../supabase/functions/_shared/emailStrings';

it('checks all six Arabic plurals, including zero', () => {
  const catalogs = loadCatalogs();
  const meta = loadMeta();
  const copy = structuredClone(catalogs);
  delete copy.ar.voice.toReview_zero;
  expect(checkCatalogs(copy, meta)).toContainEqual({ lng: 'ar', key: 'voice:toReview_zero', kind: 'missing' });
});

it('directs Arabic emails right to left while keeping security codes and URLs left to right', () => {
  expect(EMAIL_LANGUAGES).toEqual(expect.arrayContaining(['zh', 'ar']));
  const mail = renderBrandedEmail({ preheader: 'تأكيد', title: 'تأكيد البريد', paragraphs: ['يرجى تأكيد حسابكم.'], code: '123456', button: { label: 'تأكيد', url: 'https://toothops.app/#/join/test' } }, 'ar');
  expect(mail.html).toContain('<html lang="ar" dir="rtl">');
  expect(mail.html).toContain('<div dir="ltr"');
  expect(mail.html).toContain('<a dir="ltr" href="https://toothops.app/#/join/test"');
  expect(mail.text).toContain('123456');
  expect(renderBrandedEmail({ preheader: '确认', title: '确认邮箱', paragraphs: ['请确认您的账户。'] }, 'zh').html).toContain('<html lang="zh">');
});

it('prepares a language-only database migration for Chinese and Arabic', () => {
  const sql = readFileSync('supabase/migrations/20261203_chinese_arabic.sql', 'utf8');
  expect(sql).toContain("'hu','ro','zh','ar'");
  expect(sql).toContain("pg_get_functiondef('public.send_due_reminders'::regproc)");
  expect(sql).toContain('if strpos(definition, old_parts[i]) = 0 then');
  expect(sql).toContain('execute definition;');
  expect(sql).not.toContain('create or replace function public.send_due_reminders');
});
