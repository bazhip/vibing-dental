import React from 'react';
import { supabase } from '../utils/supabaseClient';
import i18n from '../i18n';
import { isAppLanguage, type AppLanguage } from '../i18n/config';
import { browserSpeechLang } from '../utils/voice/sttConfig';
import {
  startDeepgramSession, DeepgramSession, canCaptureRawAudio, createCaptureContext,
} from '../utils/deepgramVoice';

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

const appLanguage = (): AppLanguage => (isAppLanguage(i18n.language) ? i18n.language : 'en');

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
  /** Text for the AI, with low-confidence words marked "[?word]". */
  annotated?: string;
  /** ms timestamp from performance.now() at receipt. */
  receivedAt: number;
}

export interface VoiceCapture {
  supported: boolean;
  recording: boolean;
  /** Audio is actually being captured — safe to start talking. False
   *  while the key, microphone and connection are still being set up. */
  ready: boolean;
  /** Concatenated final + interim transcript so far (live). */
  transcript: string;
  /** Just the not-yet-final words currently being heard. */
  interim: string;
  /** Start a fresh session (clears the transcript). Stable. */
  start: () => void;
  /** Clear the transcript without starting. Stable. */
  clear: () => void;
  /** Ignore the mic while true (the app is speaking a prompt). Stable. */
  setMuted: (muted: boolean) => void;
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
  /** Every final segment captured since the most recent `start()`/`clear()`.
   *  Stable across renders. */
  allSegments: () => FinalSegment[];
  /** Wall-clock start time of the active (or most recent) recording,
   *  used to compute relative timestamps for downloaded transcripts. */
  startedAt: Date | null;
  /** Which transport will be used at the next `start()` call. */
  provider: VoiceProvider;
  /** The language the current (or most recent) dictation listens in: the
   *  app language when it began. Resuming keeps it while there is a
   *  transcript; transcript cleanup uses the same one. */
  lng: AppLanguage;
  /** True when the last session ended without the user pressing stop:
   *  the OS took the mic (iOS camera, a call), the page went to the
   *  background on a phone, or the connection dropped. Whatever was
   *  heard before that is kept, and onStop still fires for it. */
  interrupted: boolean;
  /** Start listening again, keeping the transcript (after Stop or an
   *  interruption). */
  resume: () => void;
  /** Clear the interrupted flag without resuming. */
  dismissInterruption: () => void;
}

/** Phones and tablets: leaving the page (app switch, lock, camera
 *  picker) cuts the mic, so treat it as an interruption up front. On
 *  desktop the mic keeps working in a background tab, so leave it be. */
function isTouchPrimary(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

interface UseVoiceCaptureOptions {
  /** Fires when a session ends (stop or interruption), once its last
   *  words are in. */
  onStop?: (transcript: string) => void;
  /** Fires for every finalized segment as it arrives. */
  onSegment?: (seg: FinalSegment) => void;
}

export function useVoiceCapture({ onStop, onSegment }: UseVoiceCaptureOptions = {}): VoiceCapture {
  const browserCtor = React.useMemo(getRecognitionCtor, []);
  // Deepgram (high accuracy + diarization) is preferred when the browser
  // can capture raw audio; its key is minted per-session by the backend,
  // so there's no BYOK. Web Speech is the fallback (and what a failed
  // mint or a non-Pro/trial account falls back to).
  const canCaptureAudio = React.useMemo(canCaptureRawAudio, []);
  const [provider, setProvider] = React.useState<VoiceProvider>(
    canCaptureAudio ? 'deepgram' : 'browser'
  );
  const supported = canCaptureAudio || browserCtor !== null;

  const [recording, setRecording] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [transcript, setTranscript] = React.useState('');
  const [interim, setInterimState] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [startedAt, setStartedAt] = React.useState<Date | null>(null);
  const [interrupted, setInterrupted] = React.useState(false);
  const [lng, setLng] = React.useState<AppLanguage>(appLanguage);
  const lngRef = React.useRef<AppLanguage>(lng);

  // Internal buffers — refs so callbacks don't have to re-bind.
  const finalRef = React.useRef('');
  const interimRef = React.useRef('');
  const pendingSegmentsRef = React.useRef<FinalSegment[]>([]);
  const recentSegmentsRef = React.useRef<FinalSegment[]>([]);
  const allSegmentsRef = React.useRef<FinalSegment[]>([]);
  const browserRef = React.useRef<SpeechRecognition | null>(null);
  const deepgramRef = React.useRef<DeepgramSession | null>(null);
  // Each start/resume gets an id. A session that's still finishing after
  // Stop (Deepgram flushing its last words) may end after the user has
  // already resumed — its end must not touch the new session's state.
  const sessionIdRef = React.useRef(0);
  // Bumps on clear()/start(): words from an older dictation never land
  // in a fresh one.
  const generationRef = React.useRef(0);
  // Set when stop() is called — before or during a Deepgram handshake too,
  // so the resolving session is torn down instead of left live.
  const stopRequestedRef = React.useRef(false);
  // True once a session is actually listening — a session that fails to
  // start is an error, not an interruption.
  const sessionLiveRef = React.useRef(false);
  // Mic permission refused: the session ends, but "resume" can't help.
  const fatalRef = React.useRef(false);

  const onStopRef = React.useRef(onStop);
  React.useEffect(() => { onStopRef.current = onStop; }, [onStop]);
  const onSegmentRef = React.useRef(onSegment);
  React.useEffect(() => { onSegmentRef.current = onSegment; }, [onSegment]);

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
    setInterimState('');
    setTranscript(finalRef.current);
    onSegmentRef.current?.(seg);
  }, []);

  const setInterim = React.useCallback((text: string) => {
    interimRef.current = text;
    setInterimState(text);
    setTranscript(finalRef.current + text);
  }, []);

  const clear = React.useCallback(() => {
    generationRef.current++;
    finalRef.current = '';
    interimRef.current = '';
    pendingSegmentsRef.current = [];
    recentSegmentsRef.current = [];
    allSegmentsRef.current = [];
    setTranscript('');
    setInterimState('');
    setError(null);
    setInterrupted(false);
    setStartedAt(null);
  }, []);

  /** A session ended. `id` identifies which; a stale one (already
   *  superseded by a resume) only flushes its words. */
  const handleSessionEnd = React.useCallback((id: number) => {
    const finalText = finalRef.current.trim();
    if (id === sessionIdRef.current) {
      const wasLive = sessionLiveRef.current;
      sessionLiveRef.current = false;
      setReady(false);
      interimRef.current = '';
      setInterimState('');
      setRecording(false);
      if (wasLive && !stopRequestedRef.current && !fatalRef.current) setInterrupted(true);
    }
    onStopRef.current?.(finalText);
  }, []);

  const startBrowser = React.useCallback((id: number) => {
    if (!browserCtor) {
      setError(i18n.t('errors.browserUnsupported', { ns: 'voice' }));
      setRecording(false);
      return;
    }
    const rec = new browserCtor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = browserSpeechLang(lngRef.current, navigator.language);

    rec.onresult = (event) => {
      let text = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const t = result[0].transcript;
        if (result.isFinal) {
          const cleaned = t.trim();
          if (cleaned) recordSegment({ text: cleaned, receivedAt: performance.now() });
        } else {
          text += t;
        }
      }
      if (text) setInterim(text);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') fatalRef.current = true;
      setError(i18n.t('errors.recognition', { ns: 'voice', error: e.error ?? i18n.t('errors.recognitionUnknown', { ns: 'voice' }) }));
    };
    rec.onend = () => {
      if (browserRef.current === rec) browserRef.current = null;
      handleSessionEnd(id);
    };

    browserRef.current = rec;
    setRecording(true);
    try {
      rec.start();
      sessionLiveRef.current = true;
      setReady(true);
    } catch (err) {
      setError(i18n.t('errors.micStart', { ns: 'voice', message: (err as Error).message }));
      browserRef.current = null;
      setRecording(false);
    }
  }, [browserCtor, recordSegment, setInterim, handleSessionEnd]);

  const startDeepgram = React.useCallback(async (id: number) => {
    setRecording(true);
    // Created before the first await so it's still inside the user's tap —
    // iOS won't start an AudioContext outside a gesture.
    const audioCtx = createCaptureContext();
    // Mint a short-lived Deepgram key from the backend (Pro-gated). If it
    // isn't available (not configured, or a non-Pro/trial caller), fall
    // back to browser speech recognition.
    let dgAuth: { token: string; kind: 'token' | 'bearer' } | null = null;
    try {
      // eslint-disable-next-line no-restricted-syntax -- dev-only: caught below; falls back to browser speech recognition
      if (!supabase) throw new Error('no cloud');
      const { data, error } = await supabase.functions.invoke('deepgram-token', { body: {} });
      // eslint-disable-next-line no-restricted-syntax -- dev-only: caught below; falls back to browser speech recognition
      if (error || !data?.token) throw new Error(data?.error || error?.message || 'no token');
      dgAuth = { token: data.token as string, kind: (data.kind as 'token' | 'bearer') || 'bearer' };
    } catch {
      audioCtx?.close().catch(() => { /* ignore */ });
      setProvider('browser');
      // Stopped (or superseded) while the token was being fetched.
      if (stopRequestedRef.current || id !== sessionIdRef.current) {
        setRecording(false);
        return;
      }
      startBrowser(id);
      return;
    }
    // Holder rather than the const below: onClose can fire while
    // startDeepgramSession is still awaiting (socket error during setup),
    // before `session` exists.
    const holder: { session: DeepgramSession | null } = { session: null };
    const generation = generationRef.current;
    try {
      const session = await startDeepgramSession(dgAuth, {
        onInterim: (t) => { if (id === sessionIdRef.current) setInterim(t); },
        // A stopped session's last words still count — unless the user
        // has since cleared/started fresh.
        onFinal: (seg) => { if (generation === generationRef.current) recordSegment(seg); },
        onError: (msg) => { if (id === sessionIdRef.current) setError(msg); },
        onClose: () => {
          if (holder.session && deepgramRef.current === holder.session) deepgramRef.current = null;
          handleSessionEnd(id);
        },
      }, audioCtx, lngRef.current);
      holder.session = session;
      // Stopped during the handshake: tear straight back down.
      if (stopRequestedRef.current || id !== sessionIdRef.current) {
        session.stop();
        if (id === sessionIdRef.current) setRecording(false);
        return;
      }
      deepgramRef.current = session;
      sessionLiveRef.current = true;
      setReady(true);
    } catch (err) {
      if (id !== sessionIdRef.current) return;
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError(i18n.t('errors.micBlocked', { ns: 'voice' }));
      } else if (name === 'NotFoundError') {
        setError(i18n.t('errors.noMic', { ns: 'voice' }));
      } else {
        setError(err instanceof Error ? err.message : i18n.t('errors.sessionStart', { ns: 'voice' }));
      }
      setRecording(false);
    }
  }, [recordSegment, setInterim, handleSessionEnd, startBrowser]);

  const begin = React.useCallback(() => {
    const id = ++sessionIdRef.current;
    stopRequestedRef.current = false;
    fatalRef.current = false;
    sessionLiveRef.current = false;
    setInterrupted(false);
    setError(null);
    setStartedAt((prev) => prev ?? new Date());
    // A dictation keeps one language: resuming mid-transcript stays in it
    // even if the app language changed meanwhile. A fresh one (nothing
    // heard yet, or after clear()/start()) takes the current app language.
    if (allSegmentsRef.current.length === 0) lngRef.current = appLanguage();
    setLng(lngRef.current);
    if (provider === 'deepgram') startDeepgram(id);
    else startBrowser(id);
  }, [provider, startBrowser, startDeepgram]);

  const isListening = () => !!browserRef.current || !!deepgramRef.current;

  const start = React.useCallback(() => {
    if (isListening()) return;
    clear();
    begin();
  }, [clear, begin]);

  const resume = React.useCallback(() => {
    if (isListening()) return;
    begin();
  }, [begin]);

  const dismissInterruption = React.useCallback(() => setInterrupted(false), []);

  const setMuted = React.useCallback((m: boolean) => {
    deepgramRef.current?.setMuted(m);
  }, []);

  const stop = React.useCallback(() => {
    stopRequestedRef.current = true;
    // Show "stopped" right away; the session finishes flushing in the
    // background and fires onStop when its last words are in.
    setRecording(false);
    setReady(false);
    interimRef.current = '';
    setInterimState('');
    const rec = browserRef.current;
    const dg = deepgramRef.current;
    browserRef.current = null;
    deepgramRef.current = null;
    if (rec) {
      try { rec.stop(); } catch { /* ignore */ }
    }
    dg?.stop();
  }, []);

  // End the session (as an interruption, not a user stop) when a phone
  // leaves the page — the mic is gone either way, and ending it cleanly
  // flushes what was heard and tells the user instead of silently
  // recording nothing.
  React.useEffect(() => {
    if (!recording || !isTouchPrimary()) return;
    const interrupt = () => {
      if (browserRef.current) {
        try { browserRef.current.stop(); } catch { /* ignore */ }
      }
      deepgramRef.current?.stop();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') interrupt();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', interrupt);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', interrupt);
    };
  }, [recording]);

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
      sessionIdRef.current++;
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
    supported, recording, ready, transcript, interim, start, clear, stop, setMuted, error,
    consumeFinalSegments, recentSegments, allSegments, startedAt,
    provider, interrupted, resume, dismissInterruption, lng,
  };
}
