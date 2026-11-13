import { renderHook, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';

const db = vi.hoisted(() => ({ row: null as unknown, update: vi.fn() }));
vi.mock('../utils/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.row, error: null }) }) }),
      update: (v: unknown) => ({ eq: async () => { db.update(v); return { error: null }; } }),
    }),
  },
}));

import { usePracticeLanguage } from './usePracticeLanguage';
import { defaultReminder, fillTemplate, useReminderTemplate } from './useReminderTemplate';

const OLD_DEFAULT = {
  subject: "Time for {{patient}}'s dental recheck",
  body:
    'Hi {{owner}},\n\n' +
    'This is a friendly reminder that {{patient}} is due for a dental recheck. ' +
    'Please give us a call to schedule an appointment.\n\n' +
    'Thank you,\n{{practice}}',
  auto: false,
  leadDays: 0,
};

describe('defaultReminder', () => {
  test('English equals the original default text', () => expect(defaultReminder('en')).toEqual(OLD_DEFAULT));
  test('keeps the placeholders in every language', () => {
    for (const lng of ['fr', 'de', 'it', 'es', 'pt'] as const) {
      const d = defaultReminder(lng);
      expect(d.subject).toContain('{{patient}}');
      expect(d.body).toContain('{{owner}}');
      expect(d.body).toContain('{{patient}}');
      expect(d.body).toContain('{{practice}}');
    }
  });
});

describe('fillTemplate', () => {
  test('empty vars use the language fallbacks', () => {
    expect(fillTemplate('{{patient}} / {{owner}} / {{practice}}', {}, 'de')).toBe('Ihrem Tier / Damen und Herren / Ihre Tierarztpraxis');
    expect(fillTemplate('{{patient}} / {{owner}} / {{practice}}', {}, 'en')).toBe('your pet / there / your veterinary practice');
  });
  test('fills given values and the recheck date', () => {
    expect(fillTemplate('{{patient}} {{recheck_date}}', { patient: 'Bo', recheckDate: '1 Dec' }, 'fr')).toBe('Bo 1 Dec');
  });
});

describe('practice language changes', () => {
  beforeEach(() => { db.update.mockClear(); });
  test('a language saved through another instance reaches the reminder hook', async () => {
    db.row = { client_language: 'it', reminder_subject: null, reminder_body: null, reminder_auto: false, reminder_lead_days: 0 };
    const rem = renderHook(() => useReminderTemplate('p1', true));
    const lang = renderHook(() => usePracticeLanguage('p1'));
    await waitFor(() => expect(rem.result.current.loaded && lang.result.current.loaded).toBe(true));
    await act(async () => { await lang.result.current.save('fr'); });
    expect(rem.result.current.language).toBe('fr');
    expect(rem.result.current.template.subject).toBe(defaultReminder('fr').subject);
  });

  test('stored standard text follows the language switch', async () => {
    db.row = { client_language: 'it', reminder_subject: defaultReminder('it').subject, reminder_body: defaultReminder('it').body };
    const lang = renderHook(() => usePracticeLanguage('p1'));
    await waitFor(() => expect(lang.result.current.loaded).toBe(true));
    await act(async () => { await lang.result.current.save('de'); });
    expect(db.update).toHaveBeenCalledWith({
      client_language: 'de', reminder_subject: defaultReminder('de').subject, reminder_body: defaultReminder('de').body,
    });
  });

  test('edited text stays untouched on a language switch', async () => {
    db.row = { client_language: 'it', reminder_subject: 'Mine', reminder_body: defaultReminder('it').body };
    const lang = renderHook(() => usePracticeLanguage('p1'));
    await waitFor(() => expect(lang.result.current.loaded).toBe(true));
    await act(async () => { await lang.result.current.save('de'); });
    expect(db.update).toHaveBeenCalledWith({ client_language: 'de', reminder_body: defaultReminder('de').body });
  });
});

describe('useReminderTemplate', () => {
  beforeEach(() => { db.update.mockClear(); });
  const load = async () => {
    const hook = renderHook(() => useReminderTemplate('p1', true));
    await waitFor(() => expect(hook.result.current.loaded).toBe(true));
    return hook;
  };

  test('empty DB fields show the practice-language default', async () => {
    db.row = { client_language: 'it', reminder_subject: null, reminder_body: '', reminder_auto: false, reminder_lead_days: 3 };
    const { result } = await load();
    expect(result.current.template).toEqual({ ...defaultReminder('it'), leadDays: 3 });
    expect(result.current.language).toBe('it');
  });

  test('stored text wins over the default', async () => {
    db.row = { client_language: 'it', reminder_subject: 'Mine', reminder_body: 'Body', reminder_auto: true, reminder_lead_days: 0 };
    const { result } = await load();
    expect(result.current.template).toMatchObject({ subject: 'Mine', body: 'Body', auto: true });
  });

  test('enabling auto-send persists localized default', async () => {
    db.row = { client_language: 'it', reminder_subject: null, reminder_body: null, reminder_auto: false, reminder_lead_days: 0 };
    const { result } = await load();
    await act(async () => { await result.current.save({ ...result.current.template, auto: true }); });
    expect(db.update).toHaveBeenCalledWith({
      reminder_subject: defaultReminder('it').subject,
      reminder_body: defaultReminder('it').body,
      reminder_auto: true,
      reminder_lead_days: 0,
    });
    expect(db.update.mock.calls[0][0].reminder_subject).toContain('Controllo dentale');
  });

  test('auto off with untouched defaults keeps the DB fields empty', async () => {
    db.row = { client_language: 'it', reminder_subject: null, reminder_body: null, reminder_auto: false, reminder_lead_days: 0 };
    const { result } = await load();
    await act(async () => { await result.current.save({ ...result.current.template, leadDays: 7 }); });
    expect(db.update).toHaveBeenCalledWith({ reminder_subject: '', reminder_body: '', reminder_auto: false, reminder_lead_days: 7 });
  });

  test('auto on with a cleared subject persists the localized standard subject', async () => {
    db.row = { client_language: 'it', reminder_subject: 'Mine', reminder_body: 'Body', reminder_auto: false, reminder_lead_days: 0 };
    const { result } = await load();
    await act(async () => { await result.current.save({ ...result.current.template, subject: '  ', body: '', auto: true }); });
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({
      reminder_subject: defaultReminder('it').subject, reminder_body: defaultReminder('it').body,
    }));
  });

  test('edited text is saved as typed', async () => {
    db.row = { client_language: 'it', reminder_subject: null, reminder_body: null, reminder_auto: false, reminder_lead_days: 0 };
    const { result } = await load();
    await act(async () => { await result.current.save({ ...result.current.template, subject: 'Custom', auto: true }); });
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ reminder_subject: 'Custom', reminder_body: defaultReminder('it').body }));
  });
});
