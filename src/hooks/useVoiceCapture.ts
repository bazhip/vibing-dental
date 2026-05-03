import React from 'react';

/**
 * Web Speech API wrapper. Browser-native (Chrome/Safari/Edge), online-
 * only, no external dependency or API cost.
 *
 * Beyond the live transcript, the hook keeps a timestamped list of
 * "final" segments so callers can do chunked extraction — pull the new
 * segments since the last extraction tick, flush context for the model,
 * etc. Web Speech marks a segment final when the user pauses, which
 * makes a natural chunk boundary.
 *
 * Firefox doesn't ship the Web Speech API yet, so callers should check
 * `supported` and surface a "use Chrome" message rather than silently
 * failing.
 */

type SpeechRecognitionConstructor = new () => SpeechRecognition;

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: ((e: Event) => void) | null;
  onerror: ((e: Event & { error?: string }) => void) | null;
}

function getRecognitionCtor(): SpeechRecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface FinalSegment {
  text: string;
  /** ms timestamp from performance.now() at receipt. */
  receivedAt: number;
}

export interface VoiceCapture {
  supported: boolean;
  recording: boolean;
  /** Concatenated final + interim transcript so far (live). */
  transcript: string;
  /** Stable across renders. */
  start: () => void;
  /** Stable across renders — also fires onStop with the final transcript. */
  stop: () => void;
  error: string | null;
  /** Pull all final segments received since the last call. Empties the
   *  internal buffer. Stable across renders. */
  consumeFinalSegments: () => FinalSegment[];
  /** Recent final segments within the last `maxAgeMs` — read-only,
   *  doesn't clear the buffer. Used as context for "this one"
   *  back-references. Stable across renders. */
  recentSegments: (maxAgeMs: number) => FinalSegment[];
}

interface UseVoiceCaptureOptions {
  onStop?: (transcript: string) => void;
}

export function useVoiceCapture({ onStop }: UseVoiceCaptureOptions = {}): VoiceCapture {
  const ctor = React.useMemo(getRecognitionCtor, []);
  const supported = ctor !== null;

  const [recording, setRecording] = React.useState(false);
  const [transcript, setTranscript] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const recognitionRef = React.useRef<SpeechRecognition | null>(null);
  const finalRef = React.useRef('');
  // Unconsumed final segments for chunked extraction.
  const pendingSegmentsRef = React.useRef<FinalSegment[]>([]);
  // Recent (sliding-window) final segments — context for the model.
  const recentSegmentsRef = React.useRef<FinalSegment[]>([]);
  const onStopRef = React.useRef(onStop);
  React.useEffect(() => { onStopRef.current = onStop; }, [onStop]);

  const start = React.useCallback(() => {
    if (!ctor) {
      setError('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    if (recognitionRef.current) return;

    const rec = new ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';

    finalRef.current = '';
    pendingSegmentsRef.current = [];
    recentSegmentsRef.current = [];
    setTranscript('');
    setError(null);

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          const cleaned = text.trim();
          if (cleaned) {
            const seg: FinalSegment = { text: cleaned, receivedAt: performance.now() };
            pendingSegmentsRef.current.push(seg);
            recentSegmentsRef.current.push(seg);
            // Cap recent buffer at 5 minutes — anything older isn't useful
            // context anymore.
            const cutoff = performance.now() - 5 * 60_000;
            while (
              recentSegmentsRef.current.length > 0 &&
              recentSegmentsRef.current[0].receivedAt < cutoff
            ) {
              recentSegmentsRef.current.shift();
            }
            finalRef.current += cleaned + ' ';
          }
        } else {
          interim += text;
        }
      }
      setTranscript(finalRef.current + interim);
    };

    rec.onerror = (e) => {
      setError(`Recognition error: ${e.error ?? 'unknown'}`);
    };

    rec.onend = () => {
      const finalText = finalRef.current.trim();
      recognitionRef.current = null;
      setRecording(false);
      onStopRef.current?.(finalText);
    };

    recognitionRef.current = rec;
    setRecording(true);
    try {
      rec.start();
    } catch (err) {
      setError(`Couldn't start microphone: ${(err as Error).message}`);
      recognitionRef.current = null;
      setRecording(false);
    }
  }, [ctor]);

  const stop = React.useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const consumeFinalSegments = React.useCallback((): FinalSegment[] => {
    const out = pendingSegmentsRef.current;
    pendingSegmentsRef.current = [];
    return out;
  }, []);

  const recentSegments = React.useCallback((maxAgeMs: number): FinalSegment[] => {
    const cutoff = performance.now() - maxAgeMs;
    return recentSegmentsRef.current.filter((s) => s.receivedAt >= cutoff);
  }, []);

  // Stop on unmount.
  React.useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  return {
    supported, recording, transcript, start, stop, error,
    consumeFinalSegments, recentSegments,
  };
}
