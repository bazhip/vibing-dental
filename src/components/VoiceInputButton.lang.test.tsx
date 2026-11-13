import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import i18n, { loadLanguage } from '../i18n';
import type { DeepgramHandlers } from '../utils/deepgramVoice';

// The whole dictation path under French, with only the network mocked:
// Deepgram session → transcript cleanup → request body → edge function.
const dg = vi.hoisted(() => ({ handlers: null as DeepgramHandlers | null, lngs: [] as string[] }));
vi.mock('../utils/deepgramVoice', async (orig) => ({
  ...(await orig<typeof import('../utils/deepgramVoice')>()),
  canCaptureRawAudio: () => true,
  createCaptureContext: () => null,
  startDeepgramSession: vi.fn(async (_auth: unknown, handlers: DeepgramHandlers, _ctx: unknown, lng: string) => {
    dg.handlers = handlers;
    dg.lngs.push(lng);
    return { stop: () => handlers.onClose(), setMuted: () => {} };
  }),
}));
const invoke = vi.hoisted(() => vi.fn());
vi.mock('../utils/supabaseClient', () => ({ supabase: { functions: { invoke } } }));

import { VoiceInputButton, actionFocus, endsMidFinding, withDestination, DANGLING_RE } from './VoiceInputButton';
import { buildStaticSystemPrompt, normalizeTranscript } from '../utils/aiAutofill';
import { deepgramUrl } from '../utils/deepgramVoice';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from '../types';

const context = {
  patientInfo: {
    patientName: '', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '', doctor: '', tech: '',
    date: '', complaint: '', treatmentReport: '', recallDate: '',
    nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
  },
  species: 'canine' as const, logo: 'socal' as const, toothData: [],
  preMarks: {}, preComments: [], postMarks: {}, postComments: [],
};

type Body = { kind?: string; system: { text: string }[]; messages: { content: { text: string }[] }[] };
const liveBodies = () => invoke.mock.calls
  .filter(([name, opts]) => name === 'ai-autofill' && (opts.body as Body).kind === 'live')
  .map(([, opts]) => opts.body as Body);

beforeEach(async () => {
  dg.handlers = null;
  dg.lngs = [];
  invoke.mockReset();
  invoke.mockImplementation(async (name: string) => (name === 'deepgram-token'
    ? { data: { token: 't', kind: 'bearer' }, error: null }
    : { data: { content: [] }, error: null }));
  window.sessionStorage.setItem('ai.introSeen', '1');
  await loadLanguage('fr');
  await i18n.changeLanguage('fr');
});
afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

describe('VoiceInputButton under French', () => {
  it('opens a French Deepgram session and sends the French prompt with the French-cleaned text', async () => {
    render(<VoiceInputButton context={context} handlers={{} as never} activeSection="charting" sessionKey="a" />);
    fireEvent.click(screen.getByRole('button', { name: /Dicter/ }));
    await waitFor(() => expect(dg.handlers).not.toBeNull());
    expect(dg.lngs).toEqual(['fr']);
    expect(new URL(deepgramUrl('fr')).searchParams.get('language')).toBe('multi');

    const said = 'cent quatre mobilité deux, tartre stade un';
    act(() => dg.handlers!.onFinal({ text: said, annotated: said, receivedAt: performance.now() }));
    await waitFor(() => expect(liveBodies()).toHaveLength(1), { timeout: 4000 });

    const body = liveBodies()[0];
    expect(body.system[0].text).toBe(buildStaticSystemPrompt('fr'));
    expect(body.system[0].text).toContain('DICTATION LANGUAGE: French');
    const cleaned = normalizeTranscript(said, 'fr');
    expect(cleaned).toBe('104 mobilité 2, tartre stade 1');
    expect(body.messages[0].content[0].text).toContain(`AS TRANSCRIBED:\n${said}\n`);
    expect(body.messages[0].content[0].text).toContain(`AUTO-CLEANED:\n${cleaned}\n`);
  }, 10000);

  it('keeps the session language on resume after the app language changes', async () => {
    render(<VoiceInputButton context={context} handlers={{} as never} activeSection="charting" sessionKey="a" />);
    fireEvent.click(screen.getByRole('button', { name: /Dicter/ }));
    await waitFor(() => expect(dg.handlers).not.toBeNull());
    act(() => dg.handlers!.onFinal({ text: 'cent quatre absente', annotated: 'cent quatre absente', receivedAt: performance.now() }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Arrêter' })[0]);
    await act(async () => { await i18n.changeLanguage('de'); });
    fireEvent.click(screen.getAllByRole('button', { name: /Fortsetzen/ })[0]);
    await waitFor(() => expect(dg.lngs).toHaveLength(2));
    expect(dg.lngs).toEqual(['fr', 'fr']);
  }, 10000);
});

describe('end of utterance: wait for the value', () => {
  const ends = (text: string, lng: 'en' | 'fr' | 'de' | 'it' | 'es') => endsMidFinding(normalizeTranscript(text, lng), lng);

  it('English is unchanged (DANGLING_RE)', () => {
    for (const t of ['one zero five GI two calc', '104 GI 2, calc 1, 105', '106 GI 2, GE', '105 GI 2 calc 3, T/FX/CCF.', '106 missing.']) {
      expect(ends(t, 'en')).toBe(DANGLING_RE.test(normalizeTranscript(t)));
    }
  });

  it('waits when a native score word ends the utterance', () => {
    expect(ends('cent quatre mobilité', 'fr')).toBe(true);
    expect(ends('cent quatre tartre stade un, mobilité de', 'fr')).toBe(true);
    expect(ends('cent quatre GI deux et', 'fr')).toBe(true);
    expect(ends('hundertvier Lockerungsgrad', 'de')).toBe(true);
    expect(ends('hundertvier Zahnfleischtasche,', 'de')).toBe(true);
    expect(ends('centoquattro tartaro', 'it')).toBe(true);
    expect(ends('ciento cuatro movilidad', 'es')).toBe(true);
    expect(ends('ciento cuatro sarro dos, ciento cinco', 'es')).toBe(true);
  });

  it('sends complete findings promptly', () => {
    expect(ends('cent quatre mobilité deux', 'fr')).toBe(false);
    expect(ends('cent quatre fracture distale', 'fr')).toBe(false);
    expect(ends('hundertvier fehlt.', 'de')).toBe(false);
    expect(ends('centoquattro mobilità due', 'it')).toBe(false);
    expect(ends('ciento cuatro ausente', 'es')).toBe(false);
  });
});

describe('section focus follows the session language', () => {
  // A diagram note holding only a perio score belongs in the grid; whether
  // it is "only a score" depends on the dictation language.
  const note = { name: 'add_comment', input: { diagram: 'pre', triadan: 104, text: 'poche 5 mm' } };

  it('a French perio-only note does not stay on the Charting page', () => {
    expect(actionFocus(note, 'charting')?.section).toBe('charting'); // English: not a score
    expect(actionFocus(note, 'charting', 'fr')?.section).toBe('diagnosis');
    expect(withDestination(note, 'charting', 'fr')).toMatch(/^→ /);
  });
});
