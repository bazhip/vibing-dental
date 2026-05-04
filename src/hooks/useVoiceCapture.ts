import React from 'react';
import { useDeepgramKey } from './useApiKey';
import { startDeepgramSession, DeepgramSession } from '../utils/deepgramVoice';

/**
 * Voice capture with two transports:
 *   - Deepgram Nova-3 streaming (used when a Deepgram API key is set in
 *     Settings) — high accuracy, speaker diarization, paid.
 *   - Web Speech API (browser native, free, mediocre on noisy clinical
 *     environments, no diarization) — fallback when no Deepgram key.
 *
 * Both transports feed the same internal segment list, so consumers see
 * a single VoiceCapture interface. Deepgram emits already-speaker-
 * labeled segments ("Speaker 0: …") so the downstream Claude prompt can
 * separate the vet's findings from the tech's chatter automatically.
 *
 * Beyond the live transcript, the hook keeps a timestamped list of
 * "final" segments so callers can do chunked extraction — pull the new
 * segments since the last extraction tick, flush context for the model,
 * etc.
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

export type VoiceProvider = 'deepgram' | 'browser';

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
  /** Every final segment captured since the most recent `start()` call.
   *  Stable across renders. */
  allSegments: () => FinalSegment[];
  /** Wall-clock start time of the active (or most recent) recording,
   *  used to compute relative timestamps for downloaded transcripts. */
  startedAt: Date | null;
  /** Which transport will be used at the next `start()` call. */
  provider: VoiceProvider;
}

interface UseVoiceCaptureOptions {
  onStop?: (transcript: string) => void;
}

export function useVoiceCapture({ onStop }: UseVoiceCaptureOptions = {}): VoiceCapture {
  const browserCtor = React.useMemo(getRecognitionCtor, []);
  const { deepgramKey, hasDeepgramKey } = useDeepgramKey();
  const provider: VoiceProvider = hasDeepgramKey ? 'deepgram' : 'browser';
  // Deepgram needs MediaRecorder + getUserMedia; Web Speech needs the
  // SpeechRecognition constructor. We're "supported" if at least one of
  // the transports works in this browser.
  const supported = provider === 'deepgram'
    ? typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices
    : browserCtor !== null;

  const [recording, setRecording] = React.useState(false);
  const [transcript, setTranscript] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [startedAt, setStartedAt] = React.useState<Date | null>(null);

  // Internal buffers — refs so callbacks don't have to re-bind.
  const finalRef = React.useRef('');
  const pendingSegmentsRef = React.useRef<FinalSegment[]>([]);
  const recentSegmentsRef = React.useRef<FinalSegment[]>([]);
  const allSegmentsRef = React.useRef<FinalSegment[]>([]);
  const browserRef = React.useRef<SpeechRecognition | null>(null);
  const deepgramRef = React.useRef<DeepgramSession | null>(null);
  const interimRef = React.useRef('');

  const onStopRef = React.useRef(onStop);
  React.useEffect(() => { onStopRef.current = onStop; }, [onStop]);

  const recordSegment = React.useCallback((seg: FinalSegment) => {
    pendingSegmentsRef.current.push(seg);
    recentSegmentsRef.current.push(seg);
    allSegmentsRef.current.push(seg);
    // Cap the recent window at 5 minutes of context.
    const cutoff = performance.now() - 5 * 60_000;
    while (
      recentSegmentsRef.current.length > 0 &&
      recentSegmentsRef.current[0].receivedAt < cutoff
    ) {
      recentSegmentsRef.current.shift();
    }
    finalRef.current += seg.text + ' ';
    interimRef.current = '';
    setTranscript(finalRef.current);
  }, []);

  const setInterim = React.useCallback((interim: string) => {
    interimRef.current = interim;
    setTranscript(finalRef.current + interim);
  }, []);

  const resetSession = React.useCallback(() => {
    finalRef.current = '';
    interimRef.current = '';
    pendingSegmentsRef.current = [];
    recentSegmentsRef.current = [];
    allSegmentsRef.current = [];
    setTranscript('');
    setError(null);
    setStartedAt(new Date());
  }, []);

  const handleSessionEnd = React.useCallback(() => {
    const finalText = finalRef.current.trim();
    setRecording(false);
    onStopRef.current?.(finalText);
  }, []);

  const startBrowser = React.useCallback(() => {
    if (!browserCtor) {
      setError('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    const rec = new browserCtor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          const cleaned = text.trim();
          if (cleaned) recordSegment({ text: cleaned, receivedAt: performance.now() });
        } else {
          interim += text;
        }
      }
      if (interim) setInterim(interim);
    };
    rec.onerror = (e) => setError(`Recognition error: ${e.error ?? 'unknown'}`);
    rec.onend = () => {
      browserRef.current = null;
      handleSessionEnd();
    };

    browserRef.current = rec;
    setRecording(true);
    try {
      rec.start();
    } catch (err) {
      setError(`Couldn't start microphone: ${(err as Error).message}`);
      browserRef.current = null;
      setRecording(false);
    }
  }, [browserCtor, recordSegment, setInterim, handleSessionEnd]);

  const startDeepgram = React.useCallback(async () => {
    setRecording(true);
    try {
      const session = await startDeepgramSession(deepgramKey, {
        onInterim: setInterim,
        onFinal: (seg) => recordSegment(seg),
        onError: (msg) => setError(msg),
        onClose: () => {
          deepgramRef.current = null;
          handleSessionEnd();
        },
      });
      deepgramRef.current = session;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn\'t start Deepgram session.');
      setRecording(false);
    }
  }, [deepgramKey, recordSegment, setInterim, handleSessionEnd]);

  const start = React.useCallback(() => {
    if (browserRef.current || deepgramRef.current) return;
    resetSession();
    if (provider === 'deepgram') startDeepgram();
    else startBrowser();
  }, [provider, resetSession, startBrowser, startDeepgram]);

  const stop = React.useCallback(() => {
    if (browserRef.current) {
      try { browserRef.current.stop(); } catch { /* ignore */ }
    }
    if (deepgramRef.current) {
      deepgramRef.current.stop();
    }
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

  const allSegments = React.useCallback(() => allSegmentsRef.current.slice(), []);

  // Stop on unmount.
  React.useEffect(() => {
    return () => {
      if (browserRef.current) {
        try { browserRef.current.abort(); } catch { /* ignore */ }
        browserRef.current = null;
      }
      if (deepgramRef.current) {
        deepgramRef.current.stop();
        deepgramRef.current = null;
      }
    };
  }, []);

  return {
    supported, recording, transcript, start, stop, error,
    consumeFinalSegments, recentSegments, allSegments, startedAt,
    provider,
  };
}
