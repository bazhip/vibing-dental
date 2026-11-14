// @vitest-environment node
// One English string, one translation: two keys whose English is identical
// must read the same in every language, so the app and the website never
// name the same thing two ways. Exceptions are listed below with the reason
// the contexts genuinely differ (or, MAIN, that both keys are the website's
// own, left exactly as main ships them).
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';

type Catalog = { [key: string]: string | Catalog };
const LANGS = ['fr', 'de', 'it', 'es'] as const;
const load = (lng: string, ns: string): Catalog => JSON.parse(readFileSync(`src/locales/${lng}/${ns}.json`, 'utf8'));
function flat(c: Catalog, prefix = ''): [string, string][] {
  return Object.entries(c).flatMap(([k, v]) => (typeof v === 'string' ? [[prefix + k, v] as [string, string]] : flat(v, `${prefix}${k}.`)));
}

const MAIN = 'Both keys are the website’s (main’s) own; left exactly as main ships them so the website matches main.';
// [the whole group of keys with this English, reason]
const ALLOW: [string[], string][] = [
  [["landing:demo.stepChart", "common:ios.tabs.chart"], "The Chart tab names the dental chart where teeth are charted (dental_chart); the landing demo step is the website's own wording."],
  [["settings:done", "app:topbar.doneEditingShort", "reminders:settings.done", "common:actions.done", "account:done", "pdfui:style.done"], "Spanish Done: main's own keys use both Hecho and Listo; left as main ships them so the website matches main."],
  [["report:ownerLabel", "settings:practice.team.roles.owner", "chart:ios.form.owner"], "Pet owner (report label, the app's Owner section) vs. a practice role (team owner): different words in every language."],
  [["settings:feedback.send", "reminders:settings.send", "common:ios.sheets.reminder.send"], "\"Send\" the button (verb) vs. \"Send\" the reminder-timing label (noun: Envoi / Versand / Invio / Envío)."],
  [["settings:feedback.sending", "reminders:composer.sending", "common:ios.sheets.sendingBusy", "account:email.sending", "auth:checkEmail.sending"], "The app matches settings:feedback.sending; only main's reminders:composer.sending differs (de spacing), left as main ships it."],
  [["email:invite.fallback.title", "email:join.fallback"], MAIN],
  [["settings:chart.anesthesia.title", "app:sections.anesthesia", "whatsNew:anesthesia.title", "voice:sections.anesthesia"], MAIN],
  [["settings:chart.charting.title", "app:sections.charting", "chart:grid.title", "whatsNew:groups.charting", "voice:sections.charting"], MAIN],
  [["app:sync.cloudNotConfigured", "library:templates.cloudOff", "media:upload.noCloud", "voice:errors.noCloud"], MAIN],
  [["account:password.confirmLabel", "auth:reset.confirmPassword"], MAIN],
  [["account:deletion.practice.confirmTitle", "library:templates.deleteTitle"], MAIN],
  [["settings:practice.discard.confirm", "reminders:settings.discard.confirm", "account:unsaved.confirm"], MAIN],
  [["common:actions.dismiss", "voice:panel.dismiss"], MAIN],
  [["onboarding:finishSetup.doctorName", "account:doctor.heading", "auth:login.doctorName"], MAIN],
  [["account:email.heading", "account:deletion.account.emailLabel", "auth:login.email"], MAIN],
  [["settings:practice.team.invalidEmail", "account:email.invalid", "auth:errors.invalidEmail"], MAIN],
  [["report:examAreas.extraoral", "forms:exam.items.extraoral"], MAIN],
  [["account:password.hideAll", "auth:reset.hidePasswords"], MAIN],
  [["account:password.hide", "auth:login.hide"], MAIN],
  [["billing:plans.individual_basic.name", "auth:login.individual"], MAIN],
  [["settings:practice.discard.cancel", "reminders:settings.discard.cancel", "account:unsaved.cancel"], MAIN],
  [["chart:diagram.label.left", "chart:diagramView.textSize.l"], MAIN],
  [["chart:toothName.side.left", "forms:anesthesia.left"], MAIN],
  [["media:imaging.loading", "pdfui:preview.loadingImages"], MAIN],
  [["reminders:settings.loading", "reminders:composer.loading", "library:loading", "library:history.loading", "auth:loading"], MAIN],
  [["settings:chart.anesthesia.blockNames.mental", "pdf:anesthesia.blocks.mental", "forms:anesthesia.blocks.mental"], MAIN],
  [["landing:demo.colMobility", "chart:grid.short.mobility"], MAIN],
  [["account:password.newLabel", "auth:reset.newPassword"], MAIN],
  [["reportui:templates.new", "app:topbar.newPatientShort", "voice:panel.new"], MAIN],
  [["settings:chart.anesthesia.blockNames.other", "settings:feedback.kinds.other", "pdf:anesthesia.other", "forms:anesthesia.other"], MAIN],
  [["reportui:modal.title", "settings:practice.ownerReport.title", "whatsNew:groups.ownerReport", "media:documents.ownerTab"], MAIN],
  [["report:examAreas.pharynx", "forms:exam.items.pharynx"], MAIN],
  [["pdf:images.radiograph", "media:imaging.radiograph"], MAIN],
  [["reportui:templates.tipRemove", "settings:practice.logo.remove", "settings:practice.team.remove", "settings:practice.team.removeConfirm", "media:imaging.remove", "forms:anesthesia.remove", "forms:customEditor.remove", "settings:chart.quickCodes.remove", "settings:chart.exam.remove", "voice:panel.remove"], MAIN],
  [["chart:toothName.side.right", "forms:anesthesia.right"], MAIN],
  [["onboarding:finishSetup.saving", "reportui:templates.saving", "settings:saving", "app:status.saving", "reminders:settings.saving", "account:doctor.saving", "library:templates.saving", "auth:reset.saving"], MAIN],
  [["reportui:templates.nameLabel", "library:templates.nameLabel", "forms:report.dialog.label"], MAIN],
  [["common:errors.api.comped", "billing:settings.comped"], MAIN],
  [["settings:logoErrors.reportTooLarge", "common:errors.api.report_config_too_large"], MAIN],
  [["settings:practice.logo.uploading", "media:imaging.uploading"], MAIN],
  [["report:yourPet", "client:reminder.fallback.pet"], MAIN],];

const PLURAL = /_(zero|one|two|few|many|other)$/;

test('keys with identical English have identical translations', () => {
  const namespaces = globSync('src/locales/en/*.json').map((f) => path.basename(f, '.json'));
  const groups = new Map<string, string[]>();
  for (const ns of namespaces) {
    for (const [key, text] of flat(load('en', ns))) groups.set(text, [...(groups.get(text) ?? []), `${ns}:${key}`]);
  }
  const tr = Object.fromEntries(
    LANGS.map((lng) => [lng, new Map(namespaces.flatMap((ns) => flat(load(lng, ns)).map(([k, v]) => [`${ns}:${k}`, v] as const)))]),
  );
  const allowed = new Map(ALLOW.map(([keys, reason]) => [[...keys].sort().join('|'), reason]));
  const problems: string[] = [];
  for (const [text, keys] of groups) {
    // Plural forms of one key share English in some languages only.
    if (new Set(keys.map((k) => k.replace(PLURAL, ''))).size < 2) continue;
    const bad = LANGS.filter((lng) => new Set(keys.map((k) => tr[lng].get(k))).size > 1);
    if (!bad.length || allowed.has([...keys].sort().join('|'))) continue;
    problems.push(`"${text}" (${bad.join(', ')}): ${keys.join(', ')}`);
  }
  expect(problems).toEqual([]);
});

test('every exception still applies (no stale entries)', () => {
  const namespaces = globSync('src/locales/en/*.json').map((f) => path.basename(f, '.json'));
  const en = new Map(namespaces.flatMap((ns) => flat(load('en', ns)).map(([k, v]) => [`${ns}:${k}`, v] as const)));
  for (const [keys, reason] of ALLOW) {
    expect(reason.length, keys.join(', ')).toBeGreaterThan(20);
    expect(new Set(keys.map((k) => en.get(k))).size, keys.join(', ')).toBe(1);
  }
});
