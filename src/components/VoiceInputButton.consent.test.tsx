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

it('opens the current section directly and waits for the clinician to start', async () => {
  consent.needs = false;
  render(<VoiceInputButton context={context} handlers={{} as never} activeSection="charting" sessionKey="a"
    contextualDestination={{ label: 'Charting' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Dictate' }));
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(FakeRecognition.started).toBe(0);
  expect(await screen.findByRole('complementary', { name: 'Charting' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Start dictation' }));
  await waitFor(() => expect(FakeRecognition.started).toBe(1));
});

it('shows the introduction once on this device and opens the current report without recording', () => {
  const device = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => device.get(key) ?? null, setItem: (key: string, value: string) => device.set(key, value) });
  window.sessionStorage.removeItem('ai.introSeen');
  const openImaging = vi.fn();
  const view = () => <VoiceInputButton context={context} handlers={{} as never} sessionKey="a"
    contextualDestination={{ label: 'Imaging', onOpen: openImaging }} />;
  const first = render(view());
  const dictate = () => fireEvent.click(screen.getByRole('button', { name: 'Dictate' }));
  dictate();
  expect(screen.getByRole('dialog', { name: 'Dictation' })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Pocket dictation guide' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
  expect(openImaging).toHaveBeenCalledTimes(1);
  expect(FakeRecognition.started).toBe(0);
  first.unmount();
  window.sessionStorage.removeItem('ai.introSeen');

  render(view());
  dictate();
  expect(screen.queryByRole('dialog', { name: 'Dictation' })).not.toBeInTheDocument();
  expect(openImaging).toHaveBeenCalledTimes(2);
  vi.unstubAllGlobals();
});

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
