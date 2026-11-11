import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';

const extract = vi.hoisted(() => vi.fn());
vi.mock('../utils/aiAutofill', async (orig) => {
  const actual = await orig<typeof import('../utils/aiAutofill')>();
  return { ...actual, prewarmAutofill: vi.fn(async () => {}), extractChartActions: extract };
});

import { VoiceInputButton } from './VoiceInputButton';

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

const speak = vi.fn();
class FakeUtterance { text: string; onend: (() => void) | null = null; onerror: (() => void) | null = null; rate = 1; constructor(t: string) { this.text = t; } }

const context = {
  patientInfo: { exam: {}, nerveBlocks: {}, treatmentReport: '' },
  species: 'canine', logo: 'none',
  toothData: [{ tooth: 'M1', triadan: 109 }, { tooth: 'P4', triadan: 108 }],
  preMarks: {}, postMarks: {}, preComments: [], postComments: [],
} as never;

const guess = { name: 'add_comment', input: { diagram: 'pre', triadan: 109, text: 'AT', uncertain: true, reason: '"8T" may be AT' } };
const alt = { name: 'add_comment', input: { diagram: 'pre', triadan: 108, text: 'T/FX' } };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Date', 'performance'] });
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
  (window as unknown as Record<string, unknown>).speechSynthesis = { speak, cancel: vi.fn() };
  (globalThis as unknown as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance;
  window.sessionStorage.setItem('ai.introSeen', '1');
  try { window.localStorage?.removeItem('ai.voicePrompts'); } catch { /* not available in this env */ }
  speak.mockClear();
  extract.mockReset();
});
afterEach(() => vi.useRealTimers());

const flush = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe('review queue', () => {
  it('flags a guess, prompts only after silence, and an alternative replaces the guess', async () => {
    extract.mockResolvedValue({
      actions: [guess], skipped: [], ran: true,
      flags: [{ heard: '109 → AT', reason: '"8T" may be AT', triadan: 109, applied: guess, options: [{ label: '108 T/FX', action: alt }] }],
    });
    const handlers = { addComment: vi.fn(), removeComment: vi.fn() };
    render(<VoiceInputButton context={context} handlers={handlers as never} activeSection="charting" sessionKey="a" />);
    fireEvent.click(screen.getByRole('button', { name: /Dictate/ }));
    act(() => FakeRecognition.last!.say('1098T'));
    await flush(3000); // utterance flush + extraction

    expect(handlers.addComment).toHaveBeenCalledWith('pre', 109, 'AT');
    expect(screen.getByText(/Needs review \(1\)/)).toBeInTheDocument();
    const callsBeforePrompt = speak.mock.calls.length; // includes the iOS unlock utterance

    // Vet keeps talking — no prompt over them.
    act(() => FakeRecognition.last!.say('still talking', false));
    await flush(2000);
    expect(speak.mock.calls.length).toBe(callsBeforePrompt);

    // Quiet for 4 s → one short prompt.
    await flush(4500);
    expect(speak.mock.calls.length).toBe(callsBeforePrompt + 1);
    expect((speak.mock.calls.at(-1)![0] as FakeUtterance).text).toBe('Check 109.');

    // Tap the alternative: guess removed, alternative applied.
    fireEvent.click(screen.getByRole('button', { name: '108 T/FX' }));
    expect(handlers.removeComment).toHaveBeenCalledWith('pre', 109, 'AT');
    expect(handlers.addComment).toHaveBeenCalledWith('pre', 108, 'T/FX');
    expect(screen.queryByText(/Needs review/)).not.toBeInTheDocument();
  });

  it('a clear spoken correction resolves the flag by itself', async () => {
    extract.mockResolvedValueOnce({
      actions: [guess], skipped: [], ran: true,
      flags: [{ heard: '109 → AT', reason: 'unsure', triadan: 109, applied: guess, options: [] }],
    });
    const clear = { name: 'add_comment', input: { diagram: 'pre', triadan: 109, text: 'TR' } };
    extract.mockResolvedValueOnce({ actions: [clear], skipped: [], ran: true, flags: [] });
    const handlers = { addComment: vi.fn(), removeComment: vi.fn() };
    render(<VoiceInputButton context={context} handlers={handlers as never} activeSection="charting" sessionKey="a" />);
    fireEvent.click(screen.getByRole('button', { name: /Dictate/ }));
    act(() => FakeRecognition.last!.say('1098T'));
    await flush(3000);
    expect(screen.getByText(/Needs review \(1\)/)).toBeInTheDocument();
    act(() => FakeRecognition.last!.say('109 is TR'));
    await flush(3000);
    expect(screen.queryByText(/Needs review/)).not.toBeInTheDocument();
  });
});
