/**
 * Deepgram Nova-3 streaming transcription. Browser-side WebSocket
 * connection authenticated via the `token` sub-protocol so the API key
 * doesn't leak into the URL.
 *
 * Diarization is enabled — utterances come back tagged with a speaker
 * index ("Speaker 0", "Speaker 1", …) so a vet's findings aren't
 * confused with the tech's chatter when piped to Claude.
 *
 * Pipeline:
 *   getUserMedia({audio:true})
 *     → MediaRecorder(audio/webm;codecs=opus, timeslice=250ms)
 *     → WebSocket(wss://api.deepgram.com/v1/listen?…, [token, KEY])
 *     → on each `is_final:true` Results event, emit a finalized
 *       segment with the speaker prefix prepended ("Speaker 1: …").
 */

export interface DeepgramSegment {
  text: string;
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
  stop: () => void;
}

const DG_URL =
  'wss://api.deepgram.com/v1/listen?model=nova-3' +
  '&punctuate=true' +
  '&smart_format=true' +
  '&interim_results=true' +
  '&diarize=true' +
  '&utterances=true' +
  '&endpointing=400' +
  '&channels=1' +
  '&language=en' +
  '&encoding=opus' +
  '&sample_rate=48000';

interface DgWord {
  word: string;
  punctuated_word?: string;
  speaker?: number;
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

export async function startDeepgramSession(
  apiKey: string,
  handlers: DeepgramHandlers
): Promise<DeepgramSession> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // Must construct the WebSocket BEFORE the MediaRecorder so we can buffer
  // audio chunks while the socket completes its handshake.
  const ws = new WebSocket(DG_URL, ['token', apiKey]);
  ws.binaryType = 'arraybuffer';

  let closed = false;
  let recorder: MediaRecorder | null = null;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  const audioBuffer: Blob[] = [];

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    keepAliveTimer = null;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* ignore */ }
    }
    stream.getTracks().forEach((t) => t.stop());
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'CloseStream' })); } catch { /* ignore */ }
    }
    try { ws.close(); } catch { /* ignore */ }
    handlers.onClose();
  };

  ws.onopen = () => {
    // Flush any audio that arrived before the socket was ready.
    audioBuffer.forEach((blob) => sendBlob(ws, blob));
    audioBuffer.length = 0;

    // Heartbeat. Deepgram closes idle connections after ~10s; keep-alive
    // every 5s avoids that during long pauses.
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
      handlers.onError(errMsg.description || errMsg.message || 'Deepgram error');
      return;
    }
    if (msg.type !== 'Results') return;
    const result = msg as DgResultsMessage;
    const alt = result.channel?.alternatives?.[0];
    const transcript = alt?.transcript ?? '';
    if (!transcript) return;

    if (!result.is_final) {
      handlers.onInterim(transcript);
      return;
    }
    // Final segment — group consecutive words by speaker so the output
    // reads as "Speaker 0: foo. Speaker 1: bar.".
    const words = alt?.words ?? [];
    const text = formatSpeakerLabeled(transcript, words);
    handlers.onFinal({ text, receivedAt: performance.now() });
  };

  ws.onerror = () => {
    handlers.onError('Deepgram WebSocket error.');
    cleanup();
  };

  ws.onclose = (event) => {
    if (!closed) {
      // Most common cause of unsolicited close: bad token (1008/1011).
      if (event.code === 1008 || event.code === 1011) {
        handlers.onError('Deepgram rejected the connection — check the API key.');
      }
      cleanup();
    }
  };

  // Start audio capture. opus@48kHz matches the URL parameters.
  const mimeType = pickMimeType();
  if (!mimeType) {
    cleanup();
    throw new Error('Browser does not support a Deepgram-compatible audio recorder.');
  }
  recorder = new MediaRecorder(stream, { mimeType });
  recorder.ondataavailable = (e) => {
    if (!e.data || e.data.size === 0) return;
    if (ws.readyState === WebSocket.OPEN) {
      sendBlob(ws, e.data);
    } else if (ws.readyState === WebSocket.CONNECTING) {
      audioBuffer.push(e.data);
    }
  };
  recorder.onerror = (ev) => {
    const err = (ev as ErrorEvent).error?.message ?? 'MediaRecorder error';
    handlers.onError(err);
    cleanup();
  };

  recorder.start(250);

  return { stop: cleanup };
}

function sendBlob(ws: WebSocket, blob: Blob): void {
  blob.arrayBuffer().then((buf) => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(buf); } catch { /* ignore */ }
    }
  }).catch(() => { /* ignore */ });
}

function pickMimeType(): string | null {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return null;
}

function formatSpeakerLabeled(transcript: string, words: DgWord[]): string {
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
          .map((w) => w.punctuated_word ?? w.word)
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
