import React from 'react';
import ReactDOM from 'react-dom';
import { useVoiceCapture, FinalSegment } from '../hooks/useVoiceCapture';
import { useModalFocus } from '../hooks/useModalFocus';
import {
  extractChartActions,
  applyAiActions,
  describeAction,
  prewarmAutofill,
  isScopedSection,
  actionAllowedInSection,
  sectionLabel,
  ChartContext,
  ChartHandlers,
  AiAction,
} from '../utils/aiAutofill';

/**
 * AI autofill: a topbar button that opens a "how it works" modal, then
 * (on Start) records and streams transcript chunks to Claude every ~22s.
 * While running, a right sidebar shows the live transcript and a log of
 * every change the AI applies; each applied action also focuses the
 * relevant section and highlights the tooth/field being edited (via
 * onActivity → EntryGrid).
 */

/** Where an applied action lives in the chart — drives section focus +
 *  field highlight in the app. */
export interface AiFocus {
  section: string;
  triadan?: number;
  field?: string;
}

export function actionFocus(a: AiAction, activeSection?: string): AiFocus | null {
  const triadan = typeof a.input.triadan === 'number' ? a.input.triadan : undefined;
  // Dictation is scoped to the page on screen: stay there (the grid's
  // Missing toggle, say, lives on Charting even though it's a diagram mark).
  if (activeSection && isScopedSection(activeSection) && actionAllowedInSection(a, activeSection)) {
    return {
      section: activeSection,
      triadan,
      field: typeof a.input.field === 'string' ? a.input.field : undefined,
    };
  }
  const diagram = a.input.diagram === 'post' ? 'procedure' : 'diagnosis';
  switch (a.name) {
    case 'set_tooth_mark':
    case 'unset_tooth_mark':
      return { section: diagram, triadan };
    case 'add_comment':
      return { section: diagram, triadan };
    case 'set_tooth_field':
      return { section: 'charting', triadan, field: typeof a.input.field === 'string' ? a.input.field : undefined };
    case 'set_exam_finding':
      return { section: 'exam' };
    case 'set_nerve_block':
    case 'set_anesthetic_drug':
      return { section: 'anesthesia' };
    case 'set_patient_field':
      return { section: 'patient', field: typeof a.input.field === 'string' ? a.input.field : undefined };
    case 'append_treatment_report':
      return { section: 'treatment' };
    default:
      return null;
  }
}

interface VoiceInputButtonProps {
  context: ChartContext;
  handlers: ChartHandlers;
  /** Called with each batch of applied actions so the app can focus the
   *  section + highlight the fields the AI just edited. */
  onActivity?: (actions: AiAction[]) => void;
  /** Chart section on screen — dictation fills this section. */
  activeSection?: string;
}

interface ActivityEntry {
  id: string;
  description: string;
  at: Date;
}

/** Safety-net flush while recording, in case no pause is ever detected. */
const CHUNK_INTERVAL_MS = 15_000;
/** Send once the speaker has been quiet this long after a final segment… */
const QUIET_FLUSH_MS = 1_200;
/** …or once speech has been pending this long, whichever comes first. */
const MAX_PENDING_MS = 6_000;
const RECENT_CONTEXT_MS = 90_000;

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  context, handlers, onActivity, activeSection,
}) => {
  const [activeChunkCount, setActiveChunkCount] = React.useState(0);
  const [activity, setActivity] = React.useState<ActivityEntry[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [introOpen, setIntroOpen] = React.useState(false);
  const introRef = useModalFocus(introOpen);

  const contextRef = React.useRef(context);
  contextRef.current = context;
  const handlersRef = React.useRef(handlers);
  handlersRef.current = handlers;
  const onActivityRef = React.useRef(onActivity);
  onActivityRef.current = onActivity;
  const sectionRef = React.useRef(activeSection);
  sectionRef.current = activeSection;
  const quietTimerRef = React.useRef<number | undefined>(undefined);
  const maxTimerRef = React.useRef<number | undefined>(undefined);

  const inFlightRef = React.useRef(false);
  const queuedFlushRef = React.useRef(false);
  const voiceRef = React.useRef<ReturnType<typeof useVoiceCapture> | null>(null);

  const appendActivity = (actions: AiAction[], skipped: AiAction[] = []) => {
    if (!actions.length && !skipped.length) return;
    const now = new Date();
    setActivity((prev) => [
      ...prev,
      ...actions.map((a, i) => ({ id: `${now.getTime()}_${i}`, description: describeAction(a), at: now })),
      ...skipped.map((a, i) => {
        const home = actionFocus(a)?.section;
        return {
          id: `${now.getTime()}_s${i}`,
          description: `Not applied${home ? ` (belongs on ${sectionLabel(home)})` : ''}: ${describeAction(a)}`,
          at: now,
        };
      }),
    ].slice(-80));
    if (actions.length) onActivityRef.current?.(actions);
  };

  const clearFlushTimers = () => {
    window.clearTimeout(quietTimerRef.current);
    window.clearTimeout(maxTimerRef.current);
    quietTimerRef.current = undefined;
    maxTimerRef.current = undefined;
  };

  const processChunk = React.useCallback(async (final = false, sectionOverride?: string): Promise<void> => {
    if (!voiceRef.current) return;
    clearFlushTimers();
    if (inFlightRef.current) { queuedFlushRef.current = true; return; }
    const section = sectionOverride ?? sectionRef.current;
    const segments: FinalSegment[] = voiceRef.current.consumeFinalSegments();
    if (segments.length === 0) return;
    const delta = segments.map((s) => s.text).join(' ').trim();
    if (!delta) return;
    const sentSet = new Set(segments.map((s) => s.receivedAt));
    const contextSegments = voiceRef.current.recentSegments(RECENT_CONTEXT_MS).filter((s) => !sentSet.has(s.receivedAt));
    const recentContext = contextSegments.map((s) => s.text).join(' ').trim();

    inFlightRef.current = true;
    setActiveChunkCount((c) => c + 1);
    try {
      const result = await extractChartActions({ delta, recentContext, context: contextRef.current, section });
      const applied = applyAiActions(result.actions, handlersRef.current);
      appendActivity(applied, result.skipped);
    } catch (err) {
      console.error('[VoiceInputButton] chunk extraction failed', err);
      setError(err instanceof Error ? err.message : 'Voice autofill failed');
    } finally {
      inFlightRef.current = false;
      setActiveChunkCount((c) => c - 1);
      const wasQueued = queuedFlushRef.current;
      queuedFlushRef.current = false;
      if (wasQueued || final) setTimeout(() => { processChunk(final).catch(console.error); }, 0);
    }
  }, []);

  const onStop = React.useCallback(async (_t: string) => { await processChunk(true); }, [processChunk]);
  const onPause = React.useCallback(() => { processChunk(true).catch(console.error); }, [processChunk]);
  // Send each utterance as soon as the speaker pauses, rather than on a
  // fixed timer; cap the wait so continuous speech still flows.
  const onSegment = React.useCallback(() => {
    const flush = () => { processChunk(false).catch(console.error); };
    window.clearTimeout(quietTimerRef.current);
    quietTimerRef.current = window.setTimeout(flush, QUIET_FLUSH_MS);
    if (maxTimerRef.current === undefined) {
      maxTimerRef.current = window.setTimeout(flush, MAX_PENDING_MS);
    }
  }, [processChunk]);
  React.useEffect(() => () => {
    window.clearTimeout(quietTimerRef.current);
    window.clearTimeout(maxTimerRef.current);
  }, []);
  const voice = useVoiceCapture({ onStop, onPause, onSegment });
  voiceRef.current = voice;

  React.useEffect(() => {
    if (!voice.recording) return;
    const id = setInterval(() => { processChunk(false).catch(console.error); }, CHUNK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [voice.recording, processChunk]);

  // Switching pages mid-dictation: whatever was said so far belongs to the
  // page it was said on, so send it now, scoped to that page.
  const prevSectionRef = React.useRef(activeSection);
  React.useEffect(() => {
    const prev = prevSectionRef.current;
    prevSectionRef.current = activeSection;
    if (prev !== activeSection && (voice.recording || voice.paused)) {
      processChunk(false, prev).catch(console.error);
    }
  }, [activeSection, voice.recording, voice.paused, processChunk]);

  React.useEffect(() => { if (voice.error) setError(voice.error); }, [voice.error]);
  React.useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(id);
  }, [error]);

  const beginRecording = () => {
    if (!voice.supported) {
      setError('Voice input needs Chrome, Edge, or Safari.');
      return;
    }
    setIntroOpen(false);
    setActivity([]);
    setError(null);
    voice.start();
    // Boot the edge function + write the prompt cache while the mic and
    // Deepgram connect, so the first utterance comes back fast.
    prewarmAutofill();
  };

  const resumeDictation = () => {
    voice.resume();
    prewarmAutofill();
  };

  const handleButton = () => {
    if (voice.recording || voice.paused) voice.stop();
    else if (voice.interrupted) resumeDictation();
    else setIntroOpen(true);
  };

  const closeSidebar = () => {
    setActivity([]);
    voice.dismissInterruption();
  };

  const handleDownloadTranscript = () => {
    const segments = voice.allSegments();
    if (segments.length === 0) return;
    const start = voice.startedAt ?? new Date();
    const startedPerf = segments[0]?.receivedAt ?? performance.now();
    const startedTs = start.getTime() - (performance.now() - startedPerf);
    const lines = [`Transcript — recording started ${start.toLocaleString()}`, ''.padEnd(60, '─'), ''];
    for (const seg of segments) {
      const wallTime = new Date(startedTs + (seg.receivedAt - startedPerf));
      const stamp = wallTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      lines.push(`[${stamp}] ${seg.text}`);
    }
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript_${start.toISOString().replace(/[:T]/g, '-').slice(0, 16)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const label = voice.recording || voice.paused
    ? 'Stop'
    : activeChunkCount > 0
      ? 'Finishing…'
      : voice.interrupted
        ? 'Resume'
        : 'AI autofill';
  const subLabel = voice.recording && activeChunkCount > 0
    ? 'listening · sending…'
    : voice.recording ? 'listening' : voice.paused ? 'paused' : null;
  const pauseToggle = voice.recording
    ? { text: 'Pause', title: 'Pause dictation — the transcript is kept', onClick: voice.pause }
    : voice.paused
      ? { text: 'Resume', title: 'Resume dictation', onClick: resumeDictation }
      : null;
  const className = ['voice-input', voice.recording ? 'voice-input--recording' : '', activeChunkCount > 0 ? 'voice-input--processing' : ''].filter(Boolean).join(' ');
  const sidebarOpen = voice.recording || voice.paused || voice.interrupted || activity.length > 0;
  const transcriptText = voice.allSegments().map((s) => s.text).join(' ');

  return (
    <div className="voice-input-wrap">
      <button
        type="button"
        className={className}
        onClick={handleButton}
        aria-pressed={voice.recording}
        title="AI autofill — dictate to fill the chart"
      >
        {voice.recording && <span className="voice-input__rec-dot" aria-hidden="true" />}
        <span className="voice-input__label">{label}</span>
        {subLabel && <span className="voice-input__sublabel">{subLabel}</span>}
      </button>
      {pauseToggle && (
        <button
          type="button"
          className={`voice-input voice-input--pause${voice.paused ? ' voice-input--paused' : ''}`}
          onClick={pauseToggle.onClick}
          aria-pressed={voice.paused}
          title={pauseToggle.title}
        >
          <span className="voice-input__label">{pauseToggle.text}</span>
        </button>
      )}

      {/* How-it-works modal, with Start inside. Portaled to <body> so it
          isn't trapped by the topbar's backdrop-filter containing block
          (which would clip a position:fixed overlay to the short topbar). */}
      {introOpen && ReactDOM.createPortal(
        <div className="ai-settings-overlay" onClick={() => setIntroOpen(false)} role="dialog" aria-modal="true" aria-label="AI autofill">
          <div className="ai-settings-modal ai-intro" ref={introRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <header className="ai-settings-header">
              <h2>AI voice autofill</h2>
              <button type="button" className="pdf-preview-close" onClick={() => setIntroOpen(false)} aria-label="Close">×</button>
            </header>
            <div className="ai-settings-body">
              <p className="ai-intro__lead">Dictate your findings and the AI charts them for you — no typing, hands on the patient.</p>
              <ul className="ai-intro__list">
                <li>Speak naturally: <em>“104 complicated crown fracture, 6 millimeter pocket distal.”</em></li>
                <li>A <strong>transcript</strong> and a live <strong>activity log</strong> open on the right so you see exactly what’s being entered.</li>
                <li>It fills <strong>the section you’re on</strong> — open Charting to dictate perio values, Exam for exam findings, and so on. Findings for another section are listed as “not applied”.</li>
                <li>Each value is <strong>highlighted as it lands</strong>.</li>
                <li>Something wrong? Press <kbd>⌘Z</kbd> in a diagram, or just say the correction.</li>
                <li>Need a moment? Press <strong>Pause</strong> — nothing is heard until you press <strong>Resume</strong>, and the transcript is kept.</li>
                <li>Press <strong>Stop</strong> (same button) when you’re done.</li>
              </ul>
              <p className="ai-intro__foot">Uses {voice.provider === 'deepgram' ? 'Deepgram Nova-3 Medical, tuned for clinical terms + speaker labels' : 'your browser’s speech recognition'}.</p>
            </div>
            <footer className="ai-settings-footer">
              <button type="button" className="diagram-view__action" onClick={() => setIntroOpen(false)}>Cancel</button>
              <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={beginRecording}>
                Start dictation
              </button>
            </footer>
          </div>
        </div>,
        document.body
      )}

      {/* Live sidebar: transcript (top) + activity log (bottom). Portaled to
          <body> for the same containing-block reason as the modal above. */}
      {sidebarOpen && ReactDOM.createPortal(
        <aside className="ai-sidebar" aria-live="polite">
          <header className="ai-sidebar__head">
            <span className={`ai-sidebar__status${voice.recording ? ' ai-sidebar__status--live' : ''}`}>
              {voice.recording ? '● Listening' : voice.paused ? 'Paused' : voice.interrupted ? 'Interrupted' : 'Last session'}
            </span>
            <span className="voice-input__provider-badge">
              {voice.provider === 'deepgram' ? '⚡ Deepgram' : 'Browser STT'}
            </span>
            <div className="ai-sidebar__head-actions">
              {transcriptText && (
                <button type="button" className="voice-input__panel-clear" onClick={handleDownloadTranscript} title="Download transcript">⬇</button>
              )}
              {pauseToggle && (
                <button type="button" className="voice-input__panel-clear" onClick={pauseToggle.onClick} title={pauseToggle.title}>
                  {pauseToggle.text}
                </button>
              )}
              {!voice.recording && !voice.paused && (
                <button type="button" className="voice-input__panel-close" onClick={closeSidebar} aria-label="Close">×</button>
              )}
            </div>
          </header>

          {voice.interrupted && !voice.recording && (
            <div className="ai-sidebar__paused" role="alert">
              <p>
                Dictation stopped because the microphone was interrupted
                (camera, phone call, or leaving the page). Everything heard
                before that was kept.
              </p>
              <div className="ai-sidebar__paused-actions">
                <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={resumeDictation}>
                  Resume dictation
                </button>
                <button type="button" className="diagram-view__action" onClick={voice.dismissInterruption}>
                  Done
                </button>
              </div>
            </div>
          )}

          <div className="ai-sidebar__section-label">Transcript</div>
          <div className="ai-sidebar__transcript">
            {transcriptText || voice.interim ? (
              <>
                {transcriptText}
                {voice.interim && <span className="ai-sidebar__interim"> {voice.interim}</span>}
              </>
            ) : (
              <span className="ai-sidebar__empty">
                {voice.paused ? 'Paused — press Resume to keep dictating.' : 'Start talking — your words appear here.'}
              </span>
            )}
          </div>

          <div className="ai-sidebar__section-label">
            Activity
            {activity.length > 0 && !voice.recording && !voice.paused && (
              <button type="button" className="voice-input__panel-clear" onClick={() => setActivity([])}>Clear</button>
            )}
          </div>
          <div className="ai-sidebar__activity">
            {activity.length === 0 ? (
              <div className="ai-sidebar__empty">
                {voice.recording || voice.paused ? 'Chart changes show here as the AI applies them.' : 'No changes applied.'}
              </div>
            ) : (
              activity.map((entry) => (
                <div key={entry.id} className="ai-sidebar__row">
                  <span className="ai-sidebar__row-time">{entry.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <span className="ai-sidebar__row-desc">{entry.description}</span>
                </div>
              ))
            )}
          </div>

          {error && <div className="voice-input__error" role="alert">{error}</div>}
        </aside>,
        document.body
      )}

      {error && !sidebarOpen && <div className="voice-input__error" role="alert">{error}</div>}
    </div>
  );
};
