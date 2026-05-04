import React from 'react';
import { useApiKey } from '../hooks/useApiKey';
import { useVoiceCapture, FinalSegment } from '../hooks/useVoiceCapture';
import {
  extractChartActions,
  applyAiActions,
  describeAction,
  ChartContext,
  ChartHandlers,
  AiAction,
} from '../utils/aiAutofill';

/**
 * Voice autofill button + live activity panel. Recording streams
 * transcript chunks to Claude every ~22 seconds (or on natural speech
 * pauses, whichever comes first); each chunk's tool calls apply
 * immediately, and the running list of changes is shown so the vet can
 * spot misinterpretations and Cmd+Z them on the spot.
 *
 * Static system prompt is cache_control'd inside aiAutofill, so each
 * chunk pays cache-read pricing on it (~10× cheaper).
 */

interface VoiceInputButtonProps {
  context: ChartContext;
  handlers: ChartHandlers;
  /** When the user clicks the mic but no key is configured, open the
   *  Settings dialog instead. */
  onNeedsApiKey: () => void;
}

interface ActivityEntry {
  id: string;
  description: string;
  at: Date;
}

/** Send to Claude every CHUNK_INTERVAL_MS while recording — keeps each
 *  chunk small, accuracy high, and gives the vet near-real-time feedback. */
const CHUNK_INTERVAL_MS = 22_000;
/** Recent transcript window included as context for back-references. */
const RECENT_CONTEXT_MS = 90_000;

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  context, handlers, onNeedsApiKey,
}) => {
  const { apiKey, hasApiKey } = useApiKey();

  const [activeChunkCount, setActiveChunkCount] = React.useState(0);
  const [activity, setActivity] = React.useState<ActivityEntry[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [showActivity, setShowActivity] = React.useState(false);

  // Keep handlers + context fresh across the recording session.
  const contextRef = React.useRef(context);
  contextRef.current = context;
  const handlersRef = React.useRef(handlers);
  handlersRef.current = handlers;
  const apiKeyRef = React.useRef(apiKey);
  apiKeyRef.current = apiKey;

  // Sequencing: only one chunk in flight at a time. Pending chunks merge.
  const inFlightRef = React.useRef(false);
  const queuedFlushRef = React.useRef(false);

  const voiceRef = React.useRef<ReturnType<typeof useVoiceCapture> | null>(null);

  const appendActivity = (actions: AiAction[]) => {
    if (!actions.length) return;
    const now = new Date();
    const entries: ActivityEntry[] = actions.map((a, i) => ({
      id: `${now.getTime()}_${i}`,
      description: describeAction(a),
      at: now,
    }));
    setActivity((prev) => [...prev, ...entries].slice(-50));
  };

  const processChunk = React.useCallback(async (final = false): Promise<void> => {
    if (!voiceRef.current) return;
    if (inFlightRef.current) {
      // Another chunk is mid-flight; queue a follow-up so trailing
      // segments still get processed.
      queuedFlushRef.current = true;
      return;
    }

    const segments: FinalSegment[] = voiceRef.current.consumeFinalSegments();
    if (segments.length === 0) return;
    const delta = segments.map((s) => s.text).join(' ').trim();
    if (!delta) return;

    // Build context from recent segments (excluding the ones we're about
    // to send as the delta — to avoid Claude re-extracting them).
    const sentSet = new Set(segments.map((s) => s.receivedAt));
    const contextSegments = voiceRef.current
      .recentSegments(RECENT_CONTEXT_MS)
      .filter((s) => !sentSet.has(s.receivedAt));
    const recentContext = contextSegments.map((s) => s.text).join(' ').trim();

    inFlightRef.current = true;
    setActiveChunkCount((c) => c + 1);
    try {
      const result = await extractChartActions({
        apiKey: apiKeyRef.current,
        delta,
        recentContext,
        context: contextRef.current,
      });
      const applied = applyAiActions(result.actions, handlersRef.current);
      appendActivity(applied);
    } catch (err) {
      console.error('[VoiceInputButton] chunk extraction failed', err);
      setError(err instanceof Error ? err.message : 'Voice autofill failed');
    } finally {
      inFlightRef.current = false;
      setActiveChunkCount((c) => c - 1);
      // If more segments came in while we were processing, flush them.
      const wasQueued = queuedFlushRef.current;
      queuedFlushRef.current = false;
      if (wasQueued || final) {
        // Use setTimeout to break the call stack and let React render.
        setTimeout(() => { processChunk(final).catch(console.error); }, 0);
      }
    }
  }, []);

  const onStop = React.useCallback(async (_transcript: string) => {
    // Flush any remaining segments after the recognizer stops.
    await processChunk(true);
  }, [processChunk]);

  const voice = useVoiceCapture({ onStop });
  voiceRef.current = voice;

  // While recording, drive a chunk every CHUNK_INTERVAL_MS.
  React.useEffect(() => {
    if (!voice.recording) return;
    const id = setInterval(() => {
      processChunk(false).catch(console.error);
    }, CHUNK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [voice.recording, processChunk]);

  // Surface STT-level errors.
  React.useEffect(() => {
    if (voice.error) setError(voice.error);
  }, [voice.error]);

  // Auto-clear transient error banner.
  React.useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(id);
  }, [error]);

  const handleClick = () => {
    if (!hasApiKey) {
      onNeedsApiKey();
      return;
    }
    if (!voice.supported) {
      setError('Voice input needs Chrome, Edge, or Safari.');
      return;
    }
    if (voice.recording) {
      voice.stop();
    } else {
      setActivity([]);
      setError(null);
      setShowActivity(true);
      voice.start();
    }
  };

  const handleClearActivity = () => {
    setActivity([]);
  };

  const handleDownloadTranscript = () => {
    const segments = voice.allSegments();
    if (segments.length === 0) return;
    const start = voice.startedAt ?? new Date();
    const startedPerf = segments[0]?.receivedAt ?? performance.now();
    const startedTs = start.getTime() - (performance.now() - startedPerf);
    const lines = [
      `Transcript — recording started ${start.toLocaleString()}`,
      ''.padEnd(60, '─'),
      '',
    ];
    for (const seg of segments) {
      const wallTime = new Date(startedTs + (seg.receivedAt - startedPerf));
      const stamp = wallTime.toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      lines.push(`[${stamp}] ${seg.text}`);
    }
    const text = lines.join('\n') + '\n';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const filename =
      `transcript_${start.toISOString().replace(/[:T]/g, '-').slice(0, 16)}.txt`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hasTranscriptToDownload = voice.allSegments().length > 0;

  const label = (() => {
    if (voice.recording) return 'Stop';
    if (activeChunkCount > 0) return 'Finishing…';
    return 'Voice';
  })();
  const subLabel = (() => {
    if (voice.recording && activeChunkCount > 0) return 'listening · sending…';
    if (voice.recording) return 'listening';
    return null;
  })();

  const className = [
    'voice-input',
    voice.recording ? 'voice-input--recording' : '',
    activeChunkCount > 0 ? 'voice-input--processing' : '',
  ].filter(Boolean).join(' ');

  const hasActivityToShow = showActivity && (voice.recording || activity.length > 0);

  return (
    <div className="voice-input-wrap">
      <button
        type="button"
        className={className}
        onClick={handleClick}
        aria-pressed={voice.recording}
        title={hasApiKey ? 'Voice autofill — start/stop recording' : 'Set Claude API key to enable'}
      >
        <span className="voice-input__icon" aria-hidden="true">
          {voice.recording ? '⏹' : '🎙'}
        </span>
        <span className="voice-input__label">{label}</span>
        {subLabel && <span className="voice-input__sublabel">{subLabel}</span>}
      </button>

      {hasActivityToShow && (
        <div className="voice-input__panel" aria-live="polite">
          <header className="voice-input__panel-head">
            <strong>{voice.recording ? 'Listening' : 'Last session'}</strong>
            <span className="voice-input__provider-badge" title={voice.provider === 'deepgram' ? 'Deepgram Nova-3 (high accuracy + speaker labels)' : 'Browser Web Speech API (free, basic)'}>
              {voice.provider === 'deepgram' ? '⚡ Deepgram' : 'Browser STT'}
            </span>
            <div className="voice-input__panel-actions">
              {hasTranscriptToDownload && (
                <button
                  type="button"
                  className="voice-input__panel-clear"
                  onClick={handleDownloadTranscript}
                  title="Download transcript as .txt"
                >
                  ⬇ Transcript
                </button>
              )}
              {activity.length > 0 && (
                <button
                  type="button"
                  className="voice-input__panel-clear"
                  onClick={handleClearActivity}
                  title="Clear activity log"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                className="voice-input__panel-close"
                onClick={() => setShowActivity(false)}
                aria-label="Close panel"
              >
                ×
              </button>
            </div>
          </header>

          {voice.recording && voice.transcript && (
            <div className="voice-input__live-transcript">
              <span className="voice-input__live-label">Hearing:</span>{' '}
              {voice.transcript.slice(-260)}
            </div>
          )}

          <div className="voice-input__activity-list">
            {activity.length === 0 ? (
              <div className="voice-input__activity-empty">
                {voice.recording
                  ? 'Talk through your findings — chart updates show here as Claude picks them up.'
                  : 'No changes applied.'}
              </div>
            ) : (
              activity.map((entry) => (
                <div key={entry.id} className="voice-input__activity-row">
                  <span className="voice-input__activity-time">
                    {entry.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="voice-input__activity-desc">{entry.description}</span>
                </div>
              ))
            )}
          </div>

          {voice.recording && (
            <div className="voice-input__panel-footer">
              Use <kbd>⌘Z</kbd> in a diagram to undo any wrong call.
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="voice-input__error" role="alert">{error}</div>
      )}
    </div>
  );
};
