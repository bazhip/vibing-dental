import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import i18n, { loadLanguage } from '../i18n';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';

const extract = vi.hoisted(() => vi.fn());
vi.mock('../utils/aiAutofill', async (orig) => {
  const actual = await orig<typeof import('../utils/aiAutofill')>();
  return {
    ...actual,
    prewarmAutofill: vi.fn(async () => {}),
    extractChartActions: extract,
    reviewFullTranscript: vi.fn(async () => ({ actions: [], skipped: [], flags: [], ran: true })),
  };
});
vi.mock('./ui/dialogs', async (orig) => ({
  ...(await orig<typeof import('./ui/dialogs')>()),
  confirmDialog: vi.fn(async () => true),
  toast: vi.fn(),
}));

import { VoiceInputButton } from './VoiceInputButton';
import { useVoiceCapture } from '../hooks/useVoiceCapture';
import { describeAction, sectionLabel } from '../utils/aiAutofill';

class FakeRecognition {
  static last: FakeRecognition | null = null;
  continuous = false; interimResults = false; lang = '';
  onresult: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  constructor() { FakeRecognition.last = this; }
  start() {} stop() { this.onend?.(); } abort() {}
  say(text: string, isFinal = true) {
    const result = Object.assign([{ transcript: text }], { isFinal });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
}

const context = {
  patientInfo: { exam: {}, nerveBlocks: {}, treatmentReport: '' },
  species: 'canine', logo: 'none',
  toothData: [{ tooth: 'M1', triadan: 109 }],
  preMarks: {}, postMarks: {}, preComments: [], postComments: [],
} as never;
const guess = { name: 'add_comment', input: { diagram: 'pre', triadan: 109, text: 'AT', uncertain: true, reason: 'unsure' } };
const props = { context, handlers: { addComment: vi.fn(), removeComment: vi.fn() } as never, activeSection: 'charting', sessionKey: 'a' };

// Fixture data and AI-supplied text (the AI's own wording is out of scope until plan 4).
const ALLOW: (string | RegExp)[] = [
  '1098T', 'Rex', '109 → AT', 'unsure', /^Charted as a guess/, /Diagnosis note @109/,
  'Tooth 109 looks calm', 'Browser STT', 'AT', 'T/FX',
];

beforeEach(async () => {
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
  window.sessionStorage.clear();
  extract.mockReset();
  extract.mockResolvedValue({
    actions: [guess], skipped: [], ran: true,
    flags: [{ heard: '109 → AT', reason: 'unsure', triadan: 109, applied: guess, options: [{ label: 'T/FX', action: guess }] }],
  });
  await installPseudoLocale();
});
afterEach(async () => {
  cleanup();
  await restoreLocale();
});

describe('VoiceInputButton', () => {
  it('idle, the intro (first run and reopened), listening, review and stopped', async () => {
    const { container } = render(<VoiceInputButton {...props} onOpenFeedback={() => {}} />);
    expect(findUntranslated(container, ALLOW)).toEqual([]);
    expect(screen.getByRole('button', { name: /⟦Dictate⟧/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /⟦Dictate⟧/ }));
    expect(findUntranslated(document.body, ALLOW)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '⟦Start dictation⟧' }));
    expect(findUntranslated(document.body, ALLOW)).toEqual([]); // listening, nothing heard yet

    act(() => FakeRecognition.last!.say('1098T'));
    await waitFor(() => expect(screen.getByText(/Needs review/)).toBeInTheDocument(), { timeout: 4000 });
    expect(findUntranslated(document.body, ALLOW)).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: '⟦Help⟧' }));
    expect(findUntranslated(document.body, ALLOW)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '⟦Got it⟧' }));

    fireEvent.click(screen.getAllByRole('button', { name: '⟦Stop⟧' })[0]);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /⟦Resume⟧/ }).length).toBeGreaterThan(0));
    expect(findUntranslated(document.body, ALLOW)).toEqual([]);

    // Collapsed panel peek line.
    fireEvent.click(screen.getByRole('button', { name: '⟦Collapse panel⟧' }));
    expect(findUntranslated(document.body, ALLOW)).toEqual([]);
  }, 15000);

  it('an unsupported browser shows a translated error', () => {
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    window.sessionStorage.setItem('ai.introSeen', '1');
    const { container } = render(<VoiceInputButton {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /⟦Dictate⟧/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('⟦Voice input needs Chrome, Edge, or Safari.⟧');
    expect(findUntranslated(container, ALLOW)).toEqual([]);
  });

  it('shows the time in the active language', async () => {
    await restoreLocale();
    await loadLanguage('fr');
    await i18n.changeLanguage('fr');
    window.sessionStorage.setItem('ai.introSeen', '1');
    render(<VoiceInputButton {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Dicter/ }));
    act(() => FakeRecognition.last!.say('1098T'));
    const time = await waitFor(() => document.body.querySelector('.ai-sidebar__row-time')!.textContent!, { timeout: 4000 });
    expect(time).toMatch(/^\d{1,2}:\d{2}:\d{2}$/);
    expect(screen.getAllByRole('button', { name: 'Arrêter' }).length).toBeGreaterThan(0);
    await i18n.changeLanguage('en');
  }, 15000);
});

describe('voice helpers and hook messages', () => {
  it('describeAction and sectionLabel follow the active language', async () => {
    await i18n.changeLanguage('fr');
    expect(describeAction({ name: 'set_nerve_block', input: { site: 'mental', mL: '0.5' } })).toBe('bloc mental = 0.5 mL');
    expect(sectionLabel('exam')).toBe('Examen');
    await i18n.changeLanguage('en');
    expect(describeAction({ name: 'set_nerve_block', input: { site: 'mental', mL: '0.5' } })).toBe('block mental = 0.5 mL');
    expect(sectionLabel('exam')).toBe('Exam');
  });

  it('useVoiceCapture reports an unsupported browser in the active language', async () => {
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    const { renderHook } = await import('@testing-library/react');
    const { result } = renderHook(() => useVoiceCapture({}));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.error).toBe('⟦Speech recognition is not supported in this browser. Try Chrome or Safari.⟧'));
  });
});
