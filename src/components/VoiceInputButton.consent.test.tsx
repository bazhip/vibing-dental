import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';

// App Store 5.1.2(i): in the app, dictation asks before anything goes to
// Deepgram/Anthropic. The consent module itself is tested in native/.
const consent = vi.hoisted(() => ({ needs: true, allow: false, ensure: vi.fn() }));
vi.mock('../native/aiConsent', () => ({
  needsAiConsent: () => consent.needs,
  ensureAiConsent: consent.ensure,
}));
vi.mock('../utils/aiAutofill', async (orig) => {
  const actual = await orig<typeof import('../utils/aiAutofill')>();
  return { ...actual, prewarmAutofill: vi.fn(async () => {}), extractChartActions: vi.fn() };
});

import { VoiceInputButton } from './VoiceInputButton';

class FakeRecognition {
  static started = 0;
  continuous = false; interimResults = false; lang = '';
  onresult: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  start() { FakeRecognition.started++; } stop() { this.onend?.(); } abort() {}
}

const context = {
  patientInfo: { exam: {}, nerveBlocks: {}, treatmentReport: '' },
  species: 'canine', logo: 'none', toothData: [],
  preMarks: {}, postMarks: {}, preComments: [], postComments: [],
} as never;

beforeEach(() => {
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
  (window as unknown as Record<string, unknown>).speechSynthesis = { speak: vi.fn(), cancel: vi.fn() };
  window.sessionStorage.setItem('ai.introSeen', '1');
  FakeRecognition.started = 0;
  consent.needs = true;
  consent.ensure.mockReset();
});

const renderButton = () =>
  render(<VoiceInputButton context={context} handlers={{} as never} activeSection="charting" sessionKey="a" />);

describe('dictation consent (app)', () => {
  it('Not now: asks, then does not start listening', async () => {
    consent.ensure.mockResolvedValue(false);
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /Dictate/ }));
    await waitFor(() => expect(consent.ensure).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(FakeRecognition.started).toBe(0);
  });

  it('Allow: starts listening', async () => {
    consent.ensure.mockResolvedValue(true);
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /Dictate/ }));
    await waitFor(() => expect(FakeRecognition.started).toBe(1));
  });

  it('already allowed (or the website): starts straight away without asking', async () => {
    consent.needs = false;
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /Dictate/ }));
    await waitFor(() => expect(FakeRecognition.started).toBe(1));
    expect(consent.ensure).not.toHaveBeenCalled();
  });
});


describe('deferred dictation consent', () => {
  it.each(['locked', 'different chart'] as const)('does not start recording after the chart becomes %s', async (change) => {
    let allow!: (allowed: boolean) => void;
    consent.ensure.mockImplementation(() => new Promise<boolean>((resolve) => { allow = resolve; }));
    const { rerender } = renderButton();
    fireEvent.click(screen.getByRole('button', { name: /Dictate/ }));
    expect(consent.ensure).toHaveBeenCalledTimes(1);
    expect(FakeRecognition.started).toBe(0);

    rerender(<VoiceInputButton
      context={context}
      handlers={{} as never}
      activeSection="charting"
      sessionKey={change === 'different chart' ? 'b' : 'a'}
      locked={change === 'locked'}
    />);
    await act(async () => { allow(true); });

    expect(FakeRecognition.started).toBe(0);
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dictate/ })).toHaveAttribute('aria-pressed', 'false');
  });
});
