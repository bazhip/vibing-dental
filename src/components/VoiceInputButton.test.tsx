import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../utils/aiAutofill', async (orig) => {
  const actual = await orig<typeof import('../utils/aiAutofill')>();
  return {
    ...actual,
    prewarmAutofill: vi.fn(async () => {}),
    extractChartActions: vi.fn(async () => ({ actions: [], skipped: [], ran: true })),
  };
});

import { VoiceInputButton } from './VoiceInputButton';

class FakeRecognition {
  static last: FakeRecognition | null = null;
  continuous = false; interimResults = false; lang = '';
  onresult: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  constructor() { FakeRecognition.last = this; }
  start() {}
  stop() { this.onend?.(); }
  abort() {}
  say(text: string) {
    const result = Object.assign([{ transcript: text }], { isFinal: true });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
}

beforeEach(() => {
  (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;
  window.sessionStorage.clear();
});

const props = {
  context: {} as never,
  handlers: {} as never,
  activeSection: 'charting',
  sessionKey: 'chart-1',
};

describe('VoiceInputButton session flow', () => {
  it('shows the intro once; reopening resumes with the old transcript', () => {
    render(<VoiceInputButton {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /AI autofill/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Start dictation' }));
    act(() => FakeRecognition.last!.say('104 GI 2'));
    expect(screen.getByText(/104 GI 2/)).toBeInTheDocument();

    // Close the panel (stops listening, keeps the transcript).
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(screen.queryByText(/104 GI 2/)).not.toBeInTheDocument();

    // Reopen: no modal, panel back, listening, transcript kept.
    const topbar = screen.getAllByRole('button', { name: /Resume/ })[0];
    fireEvent.click(topbar);
    expect(screen.queryByRole('button', { name: 'Start dictation' })).not.toBeInTheDocument();
    expect(screen.getByText(/104 GI 2/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Stop' }).length).toBeGreaterThan(0);
  });

  it('has no Pause button', () => {
    render(<VoiceInputButton {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /AI autofill/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Start dictation' }));
    expect(screen.queryByRole('button', { name: /Pause/ })).not.toBeInTheDocument();
  });

  it('a different chart starts a new dictation', () => {
    const { rerender } = render(<VoiceInputButton {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /AI autofill/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Start dictation' }));
    act(() => FakeRecognition.last!.say('old patient'));
    rerender(<VoiceInputButton {...props} sessionKey="chart-2" />);
    expect(screen.getByRole('button', { name: /AI autofill/ })).toBeInTheDocument();
  });
});

import { DANGLING_RE } from './VoiceInputButton';
import { normalizeTranscript } from '../utils/aiAutofill';

describe('DANGLING_RE — wait for the value before sending', () => {
  it('waits when a segment stops mid-finding', () => {
    expect(DANGLING_RE.test(normalizeTranscript('one zero five GI two calc'))).toBe(true);
    expect(DANGLING_RE.test(normalizeTranscript('104 GI 2, calc 1, 105'))).toBe(true);
  });
  it('sends complete findings promptly', () => {
    expect(DANGLING_RE.test(normalizeTranscript('105 GI 2 calc 3, T/FX/CCF.'))).toBe(false);
    expect(DANGLING_RE.test(normalizeTranscript('106 missing.'))).toBe(false);
  });
});
