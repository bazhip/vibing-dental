import { renderHook, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';

const db = vi.hoisted(() => ({ row: null as unknown, error: null as unknown, update: vi.fn() }));
vi.mock('../utils/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.row, error: db.error }) }) }),
      update: (v: unknown) => ({ eq: async () => { db.update(v); return { error: null }; } }),
    }),
  },
}));

import i18n, { loadLanguage } from '../i18n';
import { standardReminderText } from '../utils/reminderDefaults';
import { clientLanguageOf, usePracticeLanguage } from './usePracticeLanguage';

describe('clientLanguageOf', () => {
  test('known language wins', () => expect(clientLanguageOf({ client_language: 'de' }, 'en')).toBe('de'));
  test('null row falls back', () => expect(clientLanguageOf(null, 'fr')).toBe('fr'));
  test('null column falls back', () => expect(clientLanguageOf({ client_language: null }, 'it')).toBe('it'));
  test('unknown value falls back', () => expect(clientLanguageOf({ client_language: 'xx' }, 'en')).toBe('en'));
});

describe('usePracticeLanguage', () => {
  beforeEach(() => { db.row = { client_language: 'es' }; db.error = null; db.update.mockClear(); });

  test('reads the stored language', async () => {
    const { result } = renderHook(() => usePracticeLanguage('p1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current).toMatchObject({ language: 'es', explicit: true });
  });

  test('missing column falls back silently to the app language', async () => {
    db.row = null;
    db.error = { message: 'column practices.client_language does not exist' };
    const { result } = renderHook(() => usePracticeLanguage('p1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current).toMatchObject({ language: 'en', explicit: false });
  });

  test('save writes the column and updates state', async () => {
    const { result } = renderHook(() => usePracticeLanguage('p1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => { await result.current.save('fr'); });
    expect(db.update).toHaveBeenCalledWith({ client_language: 'fr' });
    expect(result.current.language).toBe('fr');
  });
});

describe('usePracticeLanguage reminder text follows the switch', () => {
  afterEach(async () => { await i18n.changeLanguage('en'); });

  test('stored English standard is re-persisted in the new language even when the app is French', async () => {
    await Promise.all(['en', 'fr', 'de'].map((l) => loadLanguage(l as 'en')));
    await i18n.changeLanguage('fr');
    const en = standardReminderText('en');
    db.row = { client_language: null, reminder_subject: en.subject, reminder_body: en.body };
    db.update.mockClear();
    const { result } = renderHook(() => usePracticeLanguage('p1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => { await result.current.save('de'); });
    const de = standardReminderText('de');
    expect(db.update).toHaveBeenCalledWith({ client_language: 'de', reminder_subject: de.subject, reminder_body: de.body });
  });

  test('edited text is left alone', async () => {
    await loadLanguage('de');
    db.row = { client_language: null, reminder_subject: 'My own subject', reminder_body: 'My own body' };
    db.update.mockClear();
    const { result } = renderHook(() => usePracticeLanguage('p1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => { await result.current.save('de'); });
    expect(db.update).toHaveBeenCalledWith({ client_language: 'de' });
  });
});
