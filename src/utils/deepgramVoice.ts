/**
 * Deepgram Nova-3 Medical streaming transcription. Browser-side WebSocket
 * connection authenticated via the `token`/`bearer` sub-protocol so the
 * credential doesn't leak into the URL.
 *
 * Diarization is enabled — utterances come back tagged with a speaker
 * index ("Speaker 0", "Speaker 1", …) so a vet's findings aren't
 * confused with the tech's chatter when piped to Claude.
 *
 * Pipeline:
 *   getUserMedia({audio:true})
 *     → AudioContext → AudioWorklet (ScriptProcessor fallback)
 *     → resample to 16 kHz, Float32 → Int16 (linear16)
 *     → WebSocket(wss://api.deepgram.com/v1/listen?encoding=linear16…)
 *     → on each `is_final:true` Results event, emit a finalized
 *       segment with the speaker prefix prepended ("Speaker 1: …").
 *
 * Raw PCM rather than MediaRecorder: MediaRecorder emits a WebM (Chrome,
 * newer Safari) or MP4 (older Safari) container, and declaring the wrong
 * `encoding` for it makes Deepgram decode silence — no error, just no
 * words. linear16 is unambiguous and identical on every browser.
 */

import { VOICE_KEYTERMS } from '../constants/voiceKeyterms';
import i18n from '../i18n';

export interface DeepgramSegment {
  text: string;
  /** Same text with low-confidence words marked "[?word]" — what the AI
   *  sees, so it knows which words may be misheard. */
  annotated: string;
  /** ms timestamp from performance.now(). */
  receivedAt: number;
}

export interface DeepgramHandlers {
  onInterim: (text: string) => void;
  onFinal: (segment: DeepgramSegment) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

export interface DeepgramSession {
  /** Release the mic now, then let Deepgram finish transcribing what it
   *  already has (the last words before Stop) before the socket closes.
   *  onClose fires once that's done. */
  stop: () => void;
  /** Drop mic audio while true — the app mutes itself while it speaks a
   *  prompt so it doesn't transcribe its own voice. */
  setMuted: (muted: boolean) => void;
}

/** Below this, a word is marked as possibly misheard. */
const LOW_CONFIDENCE = 0.6;

// nova-3-medical: Deepgram's clinical-domain model — tuned for medication,
// diagnostic, and procedure vocabulary and noisy operatory audio. Keyterm
// prompting (VOICE_KEYTERMS) biases it toward the veterinary-dental terms
// the human medical model won't know (Triadan, AVDC codes, vet drugs).
const TARGET_SAMPLE_RATE = 16000;
const KEYTERM_QS = VOICE_KEYTERMS.map((t) => `&keyterm=${encodeURIComponent(t)}`).join('');
export const DG_URL =
  'wss://api.deepgram.com/v1/listen?model=nova-3-medical' +
  '&punctuate=true' +
  '&smart_format=true' +
  '&interim_results=true' +
  '&diarize=true' +
  '&utterances=true' +
  '&endpointing=400' +
  '&channels=1' +
  '&language=en' +
  '&encoding=linear16' +
  // Opt out of Deepgram's Model Improvement Program: by default Deepgram
  // keeps request audio + transcripts to train its models (possibly
  // outside the region). Opted out, it doesn't store them after the
  // response — this is clinical dictation that can include names.
  '&mip_opt_out=true' +
  `&sample_rate=${TARGET_SAMPLE_RATE}` +
  KEYTERM_QS;

interface DgWord {
  word: string;
  punctuated_word?: string;
  speaker?: number;
  confidence?: number;
}

interface DgAlternative {
  transcript: string;
  words?: DgWord[];
}

interface DgChannel {
  alternatives: DgAlternative[];
}

interface DgResultsMessage {
  type: 'Results';
  is_final: boolean;
  channel: DgChannel;
}

interface DgErrorMessage {
  type: 'Error';
  description?: string;
  message?: string;
}

type DgMessage = DgResultsMessage | DgErrorMessage | { type: string };

export interface DeepgramAuth {
  /** The credential: a long-lived API key ('token') or a short-lived
   *  grant ('bearer'). */
  token: string;
  kind: 'token' | 'bearer';
}

/** How long a muted mic track may stay muted before the session is
 *  treated as interrupted. */
const MUTE_GRACE_MS = 1500;

/** How long stop() waits for Deepgram to flush its last results. */
const DRAIN_WAIT_MS = 2000;

/** Cap on audio buffered while the socket handshakes (~10 s at 16 kHz). */
const MAX_PENDING_BYTES = TARGET_SAMPLE_RATE * 2 * 10;

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** True when this browser can capture raw audio for Deepgram. */
export function canCaptureRawAudio(): boolean {
  return getAudioContextCtor() !== null && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/** Create the AudioContext for a session. Call this synchronously inside
 *  the user's click handler: iOS Safari only lets a context start running
 *  from a user gesture, and the session itself starts after an await. */
export function createCaptureContext(): AudioContext | null {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    ctx.resume().catch(() => { /* retried once the mic is attached */ });
    return ctx;
  } catch {
    return null;
  }
}

export async function startDeepgramSession(
  auth: DeepgramAuth,
  handlers: DeepgramHandlers,
  providedCtx?: AudioContext | null
): Promise<DeepgramSession> {
  const ctx = providedCtx ?? createCaptureContext();
  if (!ctx) throw new Error(i18n.t('errors.noCapture', { ns: 'voice' }));

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch (err) {
    ctx.close().catch(() => { /* ignore */ });
    throw err;
  }

  // Deepgram picks the auth scheme from the sub-protocol name.
  const ws = new WebSocket(DG_URL, [auth.kind, auth.token]);
  ws.binaryType = 'arraybuffer';

  let closed = false;
  let micReleased = false;
  let muted = false;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  let muteTimer: ReturnType<typeof setTimeout> | null = null;
  let drainTimer: ReturnType<typeof setTimeout> | null = null;
  // Audio captured while the socket is still handshaking.
  const pending: ArrayBuffer[] = [];
  let pendingBytes = 0;
  const resampler = new Resampler(ctx.sampleRate, TARGET_SAMPLE_RATE);
  let source: MediaStreamAudioSourceNode | null = null;
  let processor: AudioNode | null = null;
  let sink: GainNode | null = null;

  /** Stop capturing: mic off (the OS indicator goes away), graph torn down. */
  const releaseMic = () => {
    if (micReleased) return;
    micReleased = true;
    if (muteTimer) clearTimeout(muteTimer);
    muteTimer = null;
    try { source?.disconnect(); } catch { /* ignore */ }
    try { processor?.disconnect(); } catch { /* ignore */ }
    try { sink?.disconnect(); } catch { /* ignore */ }
    if (processor && 'port' in processor) {
      (processor as AudioWorkletNode).port.onmessage = null;
    }
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => { /* ignore */ });
  };

  /** Immediate teardown — errors, interruptions, or the end of a drain. */
  const cleanup = () => {
    if (closed) return;
    closed = true;
    releaseMic();
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    keepAliveTimer = null;
    if (drainTimer) clearTimeout(drainTimer);
    drainTimer = null;
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'CloseStream' })); } catch { /* ignore */ }
    }
    try { ws.close(); } catch { /* ignore */ }
    handlers.onClose();
  };

  /** User stop: mic off now, but keep the socket until Deepgram has sent
   *  the transcript for audio it already received — it closes the socket
   *  itself after CloseStream once it's flushed. Capped by a timeout. */
  const stopGracefully = () => {
    if (closed || drainTimer) return;
    releaseMic();
    if (ws.readyState !== WebSocket.OPEN) {
      cleanup();
      return;
    }
    try { ws.send(JSON.stringify({ type: 'CloseStream' })); } catch { cleanup(); return; }
    drainTimer = setTimeout(cleanup, DRAIN_WAIT_MS);
  };

  const onAudio = (frame: Float32Array) => {
    if (closed || micReleased || muted) return;
    const pcm = resampler.process(frame);
    if (!pcm.byteLength) return;
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(pcm); } catch { /* ignore */ }
    } else if (ws.readyState === WebSocket.CONNECTING) {
      pending.push(pcm);
      pendingBytes += pcm.byteLength;
      while (pendingBytes > MAX_PENDING_BYTES && pending.length) {
        pendingBytes -= pending.shift()!.byteLength;
      }
    }
  };

  ws.onopen = () => {
    // Flush any audio that arrived before the socket was ready.
    for (const buf of pending) {
      try { ws.send(buf); } catch { /* ignore */ }
    }
    pending.length = 0;
    pendingBytes = 0;

    // Heartbeat. Deepgram closes a connection that gets no data for ~10s;
    // this keeps it alive through silences. Sent unconditionally — Deepgram
    // accepts KeepAlive interleaved with audio.
    keepAliveTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'KeepAlive' })); } catch { /* ignore */ }
      }
    }, 5000);
  };

  ws.onmessage = (event) => {
    let msg: DgMessage;
    try {
      msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
    } catch {
      return;
    }
    if (msg.type === 'Error') {
      const errMsg = msg as DgErrorMessage;
      handlers.onError(errMsg.description || errMsg.message || i18n.t('errors.deepgram', { ns: 'voice' }));
      return;
    }
    if (msg.type !== 'Results') return;
    const result = msg as DgResultsMessage;
    const alt = result.channel?.alternatives?.[0];
    const transcript = alt?.transcript ?? '';
    if (transcript) {
      if (!result.is_final) {
        handlers.onInterim(transcript);
      } else {
        // Final segment — group consecutive words by speaker so the output
        // reads as "Speaker 0: foo. Speaker 1: bar.".
        const words = alt?.words ?? [];
        const text = formatSpeakerLabeled(transcript, words);
        const annotated = formatSpeakerLabeled(transcript, words, (w) => {
          const shown = w.punctuated_word ?? w.word;
          return w.confidence != null && w.confidence < LOW_CONFIDENCE ? `[?${shown}]` : shown;
        });
        handlers.onFinal({ text, annotated, receivedAt: performance.now() });
      }
    }
  };

  ws.onerror = () => {
    handlers.onError(i18n.t('errors.deepgramSocket', { ns: 'voice' }));
    cleanup();
  };

  ws.onclose = (event) => {
    if (!closed) {
      // Most common cause of unsolicited close: bad token (1008/1011).
      // (A close during a graceful stop is Deepgram finishing normally.)
      if (!drainTimer && (event.code === 1008 || event.code === 1011)) {
        handlers.onError(i18n.t('errors.deepgramRejected', { ns: 'voice' }));
      }
      cleanup();
    }
  };

  // Wire the audio graph. The sink is a muted gain to the destination:
  // Safari only pulls audio through nodes connected to an output.
  try {
    source = ctx.createMediaStreamSource(stream);
    processor = await createProcessor(ctx, onAudio);
    sink = ctx.createGain();
    sink.gain.value = 0;
    source.connect(processor);
    processor.connect(sink);
    sink.connect(ctx.destination);
    if (ctx.state !== 'running') await ctx.resume();
  } catch (err) {
    cleanup();
    throw err instanceof Error ? err : new Error(i18n.t('errors.captureStart', { ns: 'voice' }));
  }

  // The OS can take the mic away mid-session (iOS camera, a phone call,
  // another app). The track then ends, or goes muted and stays muted —
  // either way we'd keep "recording" silence. End the session so the
  // caller sees it stop instead of losing speech silently. A brief mute
  // (route change, AirPods connecting) is tolerated.
  for (const track of stream.getAudioTracks()) {
    track.addEventListener('ended', cleanup);
    track.addEventListener('mute', () => {
      if (muteTimer) clearTimeout(muteTimer);
      muteTimer = setTimeout(() => {
        if (track.muted) cleanup();
      }, MUTE_GRACE_MS);
    });
    track.addEventListener('unmute', () => {
      if (muteTimer) clearTimeout(muteTimer);
      muteTimer = null;
    });
  }

  return { stop: stopGracefully, setMuted: (m: boolean) => { muted = m; } };
}

/** AudioWorklet when available (off the main thread); ScriptProcessor
 *  otherwise. Both call `onAudio` with mono Float32 frames. */
async function createProcessor(
  ctx: AudioContext,
  onAudio: (frame: Float32Array) => void
): Promise<AudioNode> {
  if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    try {
      await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}pcm-worklet.js`);
      const node = new AudioWorkletNode(ctx, 'pcm-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit',
      });
      node.port.onmessage = (e: MessageEvent<Float32Array>) => onAudio(e.data);
      return node;
    } catch {
      // Fall through to ScriptProcessor.
    }
  }
  const node = ctx.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (e) => onAudio(e.inputBuffer.getChannelData(0));
  return node;
}

/** Streaming downsampler: box-averages input samples into each output
 *  sample (a cheap low-pass that avoids aliasing at 48k/44.1k → 16k) and
 *  converts to little-endian Int16. Keeps fractional position across
 *  frames so chunk boundaries don't click. */
export class Resampler {
  private readonly ratio: number;
  private acc = 0;
  private count = 0;
  private pos = 0;

  constructor(inputRate: number, outputRate: number) {
    this.ratio = inputRate / outputRate;
  }

  process(input: Float32Array): ArrayBuffer {
    const out = new Int16Array(Math.ceil(input.length / this.ratio) + 1);
    let n = 0;
    for (let i = 0; i < input.length; i++) {
      this.acc += input[i];
      this.count++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.acc / this.count));
        out[n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        this.acc = 0;
        this.count = 0;
      }
    }
    return out.buffer.slice(0, n * 2);
  }
}

export function formatSpeakerLabeled(
  transcript: string,
  words: DgWord[],
  show: (w: DgWord) => string = (w) => w.punctuated_word ?? w.word
): string {
  if (!words.length || !words.some((w) => w.speaker != null)) {
    return transcript.trim();
  }
  // Walk the words; emit a speaker prefix whenever the speaker changes.
  let currentSpeaker: number | undefined;
  const parts: string[] = [];
  let runStart = 0;
  for (let i = 0; i <= words.length; i++) {
    const sp = words[i]?.speaker;
    if (i === words.length || sp !== currentSpeaker) {
      if (i > runStart) {
        const text = words
          .slice(runStart, i)
          .map(show)
          .join(' ');
        const label = currentSpeaker != null ? `Speaker ${currentSpeaker}: ` : '';
        parts.push(label + text);
      }
      runStart = i;
      currentSpeaker = sp;
    }
  }
  return parts.join(' ').trim();
}
