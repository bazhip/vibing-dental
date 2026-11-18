import { renderHook, act } from '@testing-library/react';
import { useVoiceCapture } from './useVoiceCapture';
import i18n from '../i18n';
import * as deepgram from '../utils/deepgramVoice';
import type { DeepgramHandlers } from '../utils/deepgramVoice';

const mint = vi.hoisted(() => ({ invoke: vi.fn(async () => ({ data: { token: 'test-token', kind: 'token' }, error: null })) }));
vi.mock('../utils/supabaseClient', () => ({ supabase: { functions: mint } }));

// Fake Web Speech recognizer. jsdom has no MediaRecorder, so the hook
// picks the browser transport and uses this.
class FakeRecognition {
  static last: FakeRecognition | null = null;
  continuous = false;
  interimResults = false;
  lang = '';
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
});

describe('useVoiceCapture interruptions', () => {
  it('flags an interruption when the session ends without stop()', () => {
    const onStop = vi.fn();
    const { result } = renderHook(() => useVoiceCapture({ onStop }));
    act(() => result.current.start());
    act(() => FakeRecognition.last!.say('104 fractured'));
    // OS takes the mic: recognizer ends on its own.
    act(() => FakeRecognition.last!.onend!());
    expect(result.current.recording).toBe(false);
    expect(result.current.interrupted).toBe(true);
    expect(onStop).toHaveBeenCalledWith('104 fractured');
  });

  it('resume keeps the transcript and clears the flag', () => {
    const { result } = renderHook(() => useVoiceCapture());
    act(() => result.current.start());
    act(() => FakeRecognition.last!.say('first'));
    act(() => FakeRecognition.last!.onend!());
    act(() => result.current.resume());
    expect(result.current.interrupted).toBe(false);
    expect(result.current.recording).toBe(true);
    act(() => FakeRecognition.last!.say('second'));
    expect(result.current.allSegments().map((s) => s.text)).toEqual(['first', 'second']);
  });

  it('a user stop is not an interruption', () => {
    const { result } = renderHook(() => useVoiceCapture());
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(result.current.recording).toBe(false);
    expect(result.current.interrupted).toBe(false);
  });

  it('a refused mic permission is an error, not an interruption', () => {
    const { result } = renderHook(() => useVoiceCapture());
    act(() => result.current.start());
    act(() => {
      FakeRecognition.last!.onerror!({ error: 'not-allowed' });
      FakeRecognition.last!.onend!();
    });
    expect(result.current.interrupted).toBe(false);
    expect(result.current.error).toMatch(/not-allowed/);
  });
});

describe('useVoiceCapture stop / resume / clear', () => {
  it('stop keeps the transcript and resume continues it', () => {
    const onStop = vi.fn();
    const { result } = renderHook(() => useVoiceCapture({ onStop }));
    act(() => result.current.start());
    act(() => FakeRecognition.last!.say('first'));
    act(() => result.current.stop());
    expect(result.current.recording).toBe(false);
    expect(result.current.interrupted).toBe(false);
    expect(onStop).toHaveBeenCalledWith('first');

    act(() => result.current.resume());
    expect(result.current.recording).toBe(true);
    act(() => FakeRecognition.last!.say('second'));
    expect(result.current.allSegments().map((s) => s.text)).toEqual(['first', 'second']);
  });

  it('clear empties the transcript; start begins fresh', () => {
    const { result } = renderHook(() => useVoiceCapture());
    act(() => result.current.start());
    act(() => FakeRecognition.last!.say('old'));
    act(() => result.current.stop());
    act(() => result.current.clear());
    expect(result.current.allSegments()).toEqual([]);
    act(() => result.current.start());
    act(() => FakeRecognition.last!.say('new'));
    expect(result.current.allSegments().map((s) => s.text)).toEqual(['new']);
  });
});

describe('useVoiceCapture session language', () => {
  afterEach(async () => { await i18n.changeLanguage('en'); });

  it('reports the app language read at start, for transcript cleanup', async () => {
    const { result } = renderHook(() => useVoiceCapture());
    expect(result.current.lng).toBe('en');
    await act(async () => { await i18n.changeLanguage('fr'); });
    act(() => result.current.start());
    expect(result.current.lng).toBe('fr');
    expect(FakeRecognition.last!.lang).toMatch(/^fr/);
    // Switching mid-session keeps the session's language until the next start.
    await act(async () => { await i18n.changeLanguage('de'); });
    expect(result.current.lng).toBe('fr');
  });

  it('resume keeps the session language mid-transcript; a fresh start takes the app language', async () => {
    await act(async () => { await i18n.changeLanguage('fr'); });
    const { result } = renderHook(() => useVoiceCapture());
    act(() => result.current.start());
    act(() => FakeRecognition.last!.say('cent quatre absente'));
    act(() => result.current.stop());
    await act(async () => { await i18n.changeLanguage('de'); });
    act(() => result.current.resume());
    expect(result.current.lng).toBe('fr');
    expect(FakeRecognition.last!.lang).toMatch(/^fr/);
    act(() => result.current.stop());
    act(() => result.current.clear());
    act(() => result.current.start());
    expect(result.current.lng).toBe('de');
    expect(FakeRecognition.last!.lang).toMatch(/^de/);
  });

  it('starts fresh in an explicit clinical language and keeps ordinary start tied to the app language', async () => {
    await act(async () => { await i18n.changeLanguage('en'); });
    const { result } = renderHook(() => useVoiceCapture());
    act(() => result.current.startInLanguage!('fr'));
    expect(result.current.lng).toBe('fr');
    expect(FakeRecognition.last!.lang).toMatch(/^fr/);
    act(() => FakeRecognition.last!.say('première partie'));
    act(() => result.current.stop());
    await act(async () => { await i18n.changeLanguage('de'); });
    act(() => result.current.startInLanguage!('fr'));
    expect(result.current.lng).toBe('fr');
    expect(FakeRecognition.last!.lang).toMatch(/^fr/);
    expect(result.current.transcript).toBe('');
    act(() => FakeRecognition.last!.say('nouvelle partie'));
    expect(result.current.allSegments().map(segment => segment.text)).toEqual(['nouvelle partie']);
    act(() => result.current.stop());
    act(() => result.current.start());
    expect(result.current.lng).toBe('de');
    expect(FakeRecognition.last!.lang).toMatch(/^de/);
    expect(result.current.transcript).toBe('');
  });

  it('clears an explicit-language override when a requested fresh start is ignored during capture', async () => {
    await act(async () => { await i18n.changeLanguage('en'); });
    const { result } = renderHook(() => useVoiceCapture());
    act(() => result.current.start());
    act(() => result.current.startInLanguage!('fr'));
    expect(result.current.lng).toBe('en');
    act(() => result.current.stop());
    act(() => result.current.start());
    expect(result.current.lng).toBe('en');
    expect(FakeRecognition.last!.lang).toMatch(/^en/);
  });

  it('resume with nothing heard yet takes the current app language', async () => {
    const { result } = renderHook(() => useVoiceCapture());
    act(() => result.current.start());
    act(() => result.current.stop());
    await act(async () => { await i18n.changeLanguage('it'); });
    act(() => result.current.resume());
    expect(result.current.lng).toBe('it');
  });
});


describe('useVoiceCapture delayed Deepgram stop callbacks', () => {
  let handlers: DeepgramHandlers[];
  beforeEach(() => {
    mint.invoke.mockReset().mockResolvedValue({ data: { token: 'test-token', kind: 'token' }, error: null });
    handlers = [];
    vi.spyOn(deepgram, 'canCaptureRawAudio').mockReturnValue(true);
    vi.spyOn(deepgram, 'createCaptureContext').mockReturnValue(null);
    vi.spyOn(deepgram, 'startDeepgramSession').mockImplementation(async (_auth, callbacks) => {
      handlers.push(callbacks);
      return { stop: vi.fn(), setMuted: vi.fn() };
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('ignores an old stop after a fresh capture starts when opted in, and still finalizes the current capture', async () => {
    const oldOnStop = vi.fn();
    const newOnStop = vi.fn();
    const { result, rerender } = renderHook(({ onStop }) => useVoiceCapture({ onStop, ignoreStaleStopCallbacks: true }), { initialProps: { onStop: oldOnStop } });
    await act(async () => result.current.start());
    act(() => handlers[0].onFinal({ text: 'Old visit', annotated: 'Old visit', receivedAt: 1 }));
    act(() => result.current.stop());
    rerender({ onStop: newOnStop });
    await act(async () => result.current.start());
    act(() => handlers[1].onFinal({ text: 'New visit', annotated: 'New visit', receivedAt: 2 }));
    act(() => handlers[0].onClose());
    expect(oldOnStop).not.toHaveBeenCalled();
    expect(newOnStop).not.toHaveBeenCalled();
    expect(result.current.recording).toBe(true);
    expect(result.current.ready).toBe(true);
    expect(result.current.interrupted).toBe(false);
    expect(result.current.transcript).toBe('New visit ');
    act(() => result.current.stop());
    act(() => handlers[1].onClose());
    expect(newOnStop).toHaveBeenCalledExactlyOnceWith('New visit');
    expect(result.current.recording).toBe(false);
    expect(result.current.ready).toBe(false);
  });

  it('preserves the default stale-stop callback behavior for existing dental capture', async () => {
    const onStop = vi.fn();
    const { result } = renderHook(() => useVoiceCapture({ onStop }));
    await act(async () => result.current.start());
    act(() => result.current.stop());
    await act(async () => result.current.start());
    act(() => handlers[1].onFinal({ text: 'Current dental text', annotated: 'Current dental text', receivedAt: 2 }));
    act(() => handlers[0].onClose());
    expect(onStop).toHaveBeenCalledExactlyOnceWith('Current dental text');
    expect(result.current.recording).toBe(true);
  });

  it('reads the latest opt-in value from a ref while retaining the active session', async () => {
    const onStop = vi.fn();
    const { result, rerender } = renderHook(({ ignoreStaleStopCallbacks }) => useVoiceCapture({ onStop, ignoreStaleStopCallbacks }), { initialProps: { ignoreStaleStopCallbacks: false } });
    await act(async () => result.current.start());
    act(() => result.current.stop());
    await act(async () => result.current.start());
    const stableStart = result.current.start;
    rerender({ ignoreStaleStopCallbacks: true });
    expect(result.current.start).toBe(stableStart);
    act(() => handlers[0].onClose());
    expect(onStop).not.toHaveBeenCalled();
    expect(result.current.recording).toBe(true);
    act(() => result.current.stop());
    act(() => handlers[1].onClose());
    expect(onStop).toHaveBeenCalledExactlyOnceWith('');
  });

  it('keeps a resumed transcript but rejects late events from the prior Deepgram session', async () => {
    const onStop = vi.fn();
    const { result } = renderHook(() => useVoiceCapture({ onStop, ignoreStaleStopCallbacks: true }));
    await act(async () => result.current.start());
    act(() => handlers[0].onFinal({ text: 'First segment', annotated: 'First segment', receivedAt: 1 }));
    act(() => result.current.stop());
    await act(async () => result.current.resume());
    act(() => {
      handlers[0].onFinal({ text: 'Late old segment', annotated: 'Late old segment', receivedAt: 2 });
      handlers[0].onInterim('Late old interim');
      handlers[0].onError('Late old error');
      handlers[0].onClose();
      handlers[1].onFinal({ text: 'Resumed segment', annotated: 'Resumed segment', receivedAt: 3 });
    });
    expect(result.current.transcript).toBe('First segment Resumed segment ');
    expect(result.current.error).toBeNull();
    expect(result.current.recording).toBe(true);
    expect(onStop).not.toHaveBeenCalled();
    act(() => result.current.stop());
    act(() => handlers[1].onClose());
    expect(onStop).toHaveBeenCalledExactlyOnceWith('First segment Resumed segment');
  });

  it.each(['resolve', 'reject'] as const)('completes an opted-in Stop while token minting is pending (%s), without opening a socket, and allows retry', async outcome => {
    let resolveToken!: (value: { data: { token: string; kind: string }; error: null }) => void;
    let rejectToken!: (reason: unknown) => void;
    mint.invoke.mockImplementationOnce(() => new Promise((resolve, reject) => { resolveToken = resolve; rejectToken = reject; }));
    const onStop = vi.fn();
    const { result } = renderHook(() => useVoiceCapture({ onStop, ignoreStaleStopCallbacks: true }));
    await act(async () => result.current.start());
    expect(result.current.recording).toBe(true);
    expect(result.current.ready).toBe(false);
    act(() => result.current.stop());
    await act(async () => {
      if (outcome === 'resolve') resolveToken({ data: { token: 'stopped-token', kind: 'token' }, error: null });
      else rejectToken('token failed after stop');
    });
    expect(handlers).toHaveLength(0);
    expect(onStop).toHaveBeenCalledExactlyOnceWith('');
    expect(result.current.recording).toBe(false);
    expect(result.current.ready).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.interrupted).toBe(false);
    await act(async () => result.current.start());
    expect(handlers).toHaveLength(1);
    expect(result.current.recording).toBe(true);
    expect(result.current.ready).toBe(true);
    act(() => handlers[0].onFinal({ text: 'Retry transcript', annotated: 'Retry transcript', receivedAt: 2 }));
    act(() => result.current.stop());
    act(() => handlers[0].onClose());
    expect(onStop).toHaveBeenCalledTimes(2);
    expect(onStop).toHaveBeenLastCalledWith('Retry transcript');
  });

  it('drops an old token response before opening a socket after a new capture has started', async () => {
    let resolveOld!: (value: { data: { token: string; kind: string }; error: null }) => void;
    mint.invoke.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const onStop = vi.fn();
    const { result } = renderHook(() => useVoiceCapture({ onStop, ignoreStaleStopCallbacks: true }));
    await act(async () => result.current.start());
    act(() => result.current.stop());
    await act(async () => result.current.start());
    expect(handlers).toHaveLength(1);
    act(() => handlers[0].onFinal({ text: 'New session', annotated: 'New session', receivedAt: 2 }));
    await act(async () => resolveOld({ data: { token: 'old-token', kind: 'token' }, error: null }));
    expect(handlers).toHaveLength(1);
    expect(result.current.transcript).toBe('New session ');
    expect(result.current.recording).toBe(true);
    expect(result.current.ready).toBe(true);
    expect(onStop).not.toHaveBeenCalled();
  });

  it('ignores an old token failure without changing the new recording or its provider', async () => {
    let rejectOld!: (reason: unknown) => void;
    mint.invoke.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
    const { result } = renderHook(() => useVoiceCapture({ ignoreStaleStopCallbacks: true }));
    await act(async () => result.current.start());
    act(() => result.current.stop());
    await act(async () => result.current.start());
    await act(async () => rejectOld('old token failed'));
    expect(result.current.recording).toBe(true);
    expect(result.current.ready).toBe(true);
    expect(result.current.provider).toBe('deepgram');
    expect(result.current.error).toBeNull();
  });

});


describe('useVoiceCapture browser session ownership', () => {
  it('ignores late browser final/error/end events after a new capture starts when opted in', () => {
    const onStop = vi.fn();
    const onSegment = vi.fn();
    const { result } = renderHook(() => useVoiceCapture({ onStop, onSegment, ignoreStaleStopCallbacks: true }));
    act(() => result.current.start());
    const old = FakeRecognition.last!;
    // Model the delayed browser shutdown without delivering onend yet.
    old.stop = () => {};
    act(() => result.current.stop());
    act(() => result.current.start());
    const current = FakeRecognition.last!;
    act(() => current.say('New patient'));
    act(() => {
      old.say('Old patient');
      old.onerror?.({ error: 'not-allowed' });
      old.onend?.();
    });
    expect(result.current.transcript).toBe('New patient ');
    expect(result.current.error).toBeNull();
    expect(result.current.recording).toBe(true);
    expect(result.current.ready).toBe(true);
    expect(result.current.interrupted).toBe(false);
    expect(onStop).not.toHaveBeenCalled();
    expect(onSegment).toHaveBeenCalledTimes(1);
    act(() => result.current.stop());
    expect(onStop).toHaveBeenCalledExactlyOnceWith('New patient');
  });

  it('ignores events from a cleared browser generation even before another recording begins', () => {
    const onStop = vi.fn();
    const { result } = renderHook(() => useVoiceCapture({ onStop, ignoreStaleStopCallbacks: true }));
    act(() => result.current.start());
    const old = FakeRecognition.last!;
    old.stop = () => {};
    act(() => result.current.stop());
    act(() => result.current.clear());
    act(() => {
      old.say('Discarded transcript');
      old.onerror?.({ error: 'not-allowed' });
      old.onend?.();
    });
    expect(result.current.transcript).toBe('');
    expect(result.current.error).toBeNull();
    expect(onStop).not.toHaveBeenCalled();
  });
});
