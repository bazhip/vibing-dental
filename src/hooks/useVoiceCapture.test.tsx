import { renderHook, act } from '@testing-library/react';
import { useVoiceCapture } from './useVoiceCapture';
import i18n from '../i18n';

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
});
