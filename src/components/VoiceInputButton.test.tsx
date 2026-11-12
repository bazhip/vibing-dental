import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../utils/aiAutofill', async (orig) => {
  const actual = await orig<typeof import('../utils/aiAutofill')>();
  return {
    ...actual,
    prewarmAutofill: vi.fn(async () => {}),
    extractChartActions: vi.fn(async () => ({ actions: [], skipped: [], flags: [], ran: true })),
    reviewFullTranscript: vi.fn(async () => ({ actions: [], skipped: [], flags: [], ran: true })),
  };
});

import { VoiceInputButton } from './VoiceInputButton';
import { extractChartActions, reviewFullTranscript, prewarmAutofill } from '../utils/aiAutofill';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from '../types';

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
  hear(text: string) {
    const result = Object.assign([{ transcript: text }], { isFinal: false });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
}

beforeEach(() => {
  (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;
  window.sessionStorage.clear();
  vi.mocked(extractChartActions).mockClear();
  vi.mocked(reviewFullTranscript).mockClear();
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

    fireEvent.click(screen.getByRole('button', { name: /Dictate/ }));
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
    fireEvent.click(screen.getByRole('button', { name: /Dictate/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Start dictation' }));
    expect(screen.queryByRole('button', { name: /Pause/ })).not.toBeInTheDocument();
  });

  it('a different chart starts a new dictation', () => {
    const { rerender } = render(<VoiceInputButton {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Dictate/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Start dictation' }));
    act(() => FakeRecognition.last!.say('old patient'));
    rerender(<VoiceInputButton {...props} sessionKey="chart-2" />);
    expect(screen.getByRole('button', { name: /Dictate/ })).toBeInTheDocument();
  });
});

const realContext = {
  patientInfo: {
    patientName: '', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '', doctor: '', tech: '',
    date: '', complaint: '', treatmentReport: '', recallDate: '',
    nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
  },
  species: 'canine' as const, logo: 'socal' as const, toothData: [],
  preMarks: {}, preComments: [], postMarks: {}, postComments: [],
};
const gi = { name: 'set_tooth_field', input: { triadan: 104, field: 'gingivitis', value: '2' } };

function startDictation() {
  fireEvent.click(screen.getByRole('button', { name: /Dictate/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Start dictation' }));
}

describe('VoiceInputButton — stopping', () => {
  // Earlier tests stop dictations whose final checks finish asynchronously.
  beforeEach(async () => {
    await new Promise((r) => setTimeout(r, 500));
    vi.mocked(extractChartActions).mockClear();
    vi.mocked(reviewFullTranscript).mockClear();
  });

  it('Stop mid-request still charts everything said, then runs the final check', async () => {
    let release!: () => void;
    vi.mocked(extractChartActions).mockImplementationOnce(
      () => new Promise((r) => { release = () => r({ actions: [], skipped: [], flags: [], ran: true }); }),
    );
    render(<VoiceInputButton {...props} context={realContext} />);
    startDictation();
    act(() => FakeRecognition.last!.say('104 GI 2'));
    await act(async () => { await new Promise((r) => setTimeout(r, 1300)); }); // quiet flush → in flight
    expect(extractChartActions).toHaveBeenCalledTimes(1);
    act(() => FakeRecognition.last!.say('105 missing'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Stop' })[0]);
    expect(reviewFullTranscript).not.toHaveBeenCalled(); // waits for the live request
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 600)); });

    const deltas = vi.mocked(extractChartActions).mock.calls.map((c) => c[0].delta);
    expect(deltas).toEqual(['104 GI 2', '105 missing']);
    expect(reviewFullTranscript).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reviewFullTranscript).mock.calls[0][0].transcript).toBe('104 GI 2\n105 missing');
  });

  it('a result that returns after switching charts is dropped', async () => {
    let release!: () => void;
    vi.mocked(extractChartActions).mockImplementationOnce(
      () => new Promise((r) => { release = () => r({ actions: [gi], skipped: [], flags: [], ran: true }); }),
    );
    const setToothField = vi.fn();
    const handlers = { setToothField } as never;
    const { rerender } = render(<VoiceInputButton {...props} context={realContext} handlers={handlers} />);
    startDictation();
    act(() => FakeRecognition.last!.say('104 GI 2'));
    await act(async () => { await new Promise((r) => setTimeout(r, 1300)); });
    rerender(<VoiceInputButton {...props} context={realContext} handlers={handlers} sessionKey="chart-2" />);
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 400)); });
    expect(setToothField).not.toHaveBeenCalled();
    expect(reviewFullTranscript).not.toHaveBeenCalled();
  });

  it('no final check once the chart is view-only', async () => {
    const { rerender } = render(<VoiceInputButton {...props} context={realContext} />);
    startDictation();
    act(() => FakeRecognition.last!.say('104 GI 2'));
    rerender(<VoiceInputButton {...props} context={realContext} locked />);
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(extractChartActions).toHaveBeenCalledTimes(1); // what was said still charted
    expect(reviewFullTranscript).not.toHaveBeenCalled();
  });
});

import { DANGLING_RE } from './VoiceInputButton';
import { normalizeTranscript } from '../utils/aiAutofill';

describe('DANGLING_RE — wait for the value before sending', () => {
  it('waits when a segment stops mid-finding', () => {
    expect(DANGLING_RE.test(normalizeTranscript('one zero five GI two calc'))).toBe(true);
    expect(DANGLING_RE.test(normalizeTranscript('104 GI 2, calc 1, 105'))).toBe(true);
    expect(DANGLING_RE.test(normalizeTranscript('106 GI 2, GE'))).toBe(true);
  });
  it('sends complete findings promptly', () => {
    expect(DANGLING_RE.test(normalizeTranscript('105 GI 2 calc 3, T/FX/CCF.'))).toBe(false);
    expect(DANGLING_RE.test(normalizeTranscript('106 missing.'))).toBe(false);
  });
});

describe('VoiceInputButton — final check only when something new was said', () => {
  beforeEach(async () => {
    await new Promise((r) => setTimeout(r, 500));
    vi.mocked(extractChartActions).mockClear();
    vi.mocked(reviewFullTranscript).mockClear();
  });

  it('Stop → Resume → Stop with nothing new said runs the final check once', async () => {
    render(<VoiceInputButton {...props} context={realContext} />);
    startDictation();
    act(() => FakeRecognition.last!.say('104 GI 2'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Stop' })[0]);
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(reviewFullTranscript).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole('button', { name: /Resume/ })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Stop' })[0]);
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(reviewFullTranscript).toHaveBeenCalledTimes(1); // nothing new: skipped

    fireEvent.click(screen.getAllByRole('button', { name: /Resume/ })[0]);
    act(() => FakeRecognition.last!.say('105 missing'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Stop' })[0]);
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(reviewFullTranscript).toHaveBeenCalledTimes(2); // new speech: checked again
  });
});

describe('VoiceInputButton — cache warm-up', () => {
  beforeEach(async () => {
    await new Promise((r) => setTimeout(r, 500));
    vi.mocked(prewarmAutofill).mockClear();
  });

  it('opening Dictate does not warm up; the first words do, once per listen', () => {
    render(<VoiceInputButton {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Dictate/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Start dictation' }));
    expect(prewarmAutofill).not.toHaveBeenCalled();
    act(() => FakeRecognition.last!.hear('one oh'));
    expect(prewarmAutofill).toHaveBeenCalledTimes(1);
    act(() => FakeRecognition.last!.hear('one oh four GI'));
    expect(prewarmAutofill).toHaveBeenCalledTimes(1);
  });
});
