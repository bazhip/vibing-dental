import React from 'react';
import ReactDOM from 'react-dom';
import { useVoiceCapture, FinalSegment } from '../hooks/useVoiceCapture';
import { useModalFocus } from '../hooks/useModalFocus';
import {
  extractChartActions,
  applyAiActions,
  dedupeActions,
  normalizeTranscript,
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
 * AI autofill: a topbar button plus a live panel (right sidebar on
 * desktop, bottom sheet on phones) showing the transcript and every
 * change the AI applies. Each utterance goes to Claude when the speaker
 * pauses, scoped to the chart section on screen.
 *
 * One dictation per chart: Stop ends listening but keeps the transcript
 * and activity log, and pressing the button again carries on from there.
 * "New" in the panel starts over; opening a different chart does too.
 * The how-it-works modal shows only the first time in a tab.
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
  /** Identifies the open chart. When it changes, the dictation (transcript
   *  + activity) starts over so nothing carries into another patient. */
  sessionKey?: string;
}

interface ActivityEntry {
  id: string;
  description: string;
  at: Date;
  skipped?: boolean;
}

/** Safety-net flush while recording, in case no pause is ever detected. */
const CHUNK_INTERVAL_MS = 15_000;
/** Send once the speaker has been quiet this long after a final segment… */
const QUIET_FLUSH_MS = 1_200;
/** …or longer when the segment stops mid-finding ("105 GI two calc"),
 *  since the value is probably coming in the next breath. */
const DANGLING_FLUSH_MS = 2_500;
// Ends on a score word with no number yet, or on a bare tooth number.
export const DANGLING_RE = /(?:\b(?:GI|G|calc|calculus|mobility|mob|pocket|furcation|F|PD|stage|grade|class|recession|and)|\b[1-8][0-1]\d)\s*[,.]?\s*$/i;
/** …or once speech has been pending this long, whichever comes first. */
const MAX_PENDING_MS = 6_000;
const RECENT_CONTEXT_MS = 90_000;

const INTRO_SEEN_KEY = 'ai.introSeen';
const COLLAPSED_KEY = 'ai.panelCollapsed';

const session = {
  get: (k: string) => { try { return window.sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { window.sessionStorage.setItem(k, v); } catch { /* private mode */ } },
};

/** Phones: start the panel collapsed so the chart stays visible. */
const isPhone = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 700px)').matches;

/** Keeps a scroll box pinned to the bottom as content grows — unless the
 *  user has scrolled up to read, in which case it leaves them there. */
function useStickToBottom<T extends HTMLElement>(dep: unknown) {
  const ref = React.useRef<T | null>(null);
  const stick = React.useRef(true);
  const onScroll = React.useCallback(() => {
    const el = ref.current;
    if (el) stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
  }, []);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [dep]);
  return { ref, onScroll };
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  context, handlers, onActivity, activeSection, sessionKey,
}) => {
  const [activeChunkCount, setActiveChunkCount] = React.useState(0);
  const [activity, setActivity] = React.useState<ActivityEntry[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  /** 'start' = first-run intro with a Start button; 'info' = reopened
   *  from the panel, just a Close button. */
  const [intro, setIntro] = React.useState<null | 'start' | 'info'>(null);
  const introRef = useModalFocus(intro !== null);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(() => {
    const saved = session.get(COLLAPSED_KEY);
    return saved === null ? isPhone() : saved === '1';
  });
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      session.set(COLLAPSED_KEY, c ? '0' : '1');
      return !c;
    });
  };

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
          skipped: true,
        };
      }),
    ].slice(-200));
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
      const fresh = dedupeActions(result.actions, contextRef.current);
      const applied = applyAiActions(fresh, handlersRef.current);
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
  // Send each utterance as soon as the speaker pauses, rather than on a
  // fixed timer; cap the wait so continuous speech still flows.
  const onSegment = React.useCallback((seg: FinalSegment) => {
    const flush = () => { processChunk(false).catch(console.error); };
    const dangling = DANGLING_RE.test(normalizeTranscript(seg.text));
    window.clearTimeout(quietTimerRef.current);
    quietTimerRef.current = window.setTimeout(flush, dangling ? DANGLING_FLUSH_MS : QUIET_FLUSH_MS);
    if (maxTimerRef.current === undefined) {
      maxTimerRef.current = window.setTimeout(flush, MAX_PENDING_MS);
    }
  }, [processChunk]);
  React.useEffect(() => () => {
    window.clearTimeout(quietTimerRef.current);
    window.clearTimeout(maxTimerRef.current);
  }, []);
  const voice = useVoiceCapture({ onStop, onSegment });
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
    if (prev !== activeSection && voice.recording) {
      processChunk(false, prev).catch(console.error);
    }
  }, [activeSection, voice.recording, processChunk]);

  React.useEffect(() => { if (voice.error) setError(voice.error); }, [voice.error]);
  React.useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(id);
  }, [error]);

  const transcriptText = voice.allSegments().map((s) => s.text).join(' ');
  const hasSession = transcriptText.length > 0 || activity.length > 0;

  // A different chart: start over so nothing carries across patients.
  const prevKeyRef = React.useRef(sessionKey);
  React.useEffect(() => {
    if (prevKeyRef.current === sessionKey) return;
    prevKeyRef.current = sessionKey;
    if (voiceRef.current?.recording) voiceRef.current.stop();
    voiceRef.current?.clear();
    setActivity([]);
    setPanelOpen(false);
  }, [sessionKey]);

  const listen = (fresh: boolean) => {
    if (!voice.supported) {
      setError('Voice input needs Chrome, Edge, or Safari.');
      return;
    }
    setError(null);
    setPanelOpen(true);
    if (fresh) {
      setActivity([]);
      voice.start();
    } else {
      voice.resume();
    }
    // Boot the edge function + write the prompt cache while the mic and
    // Deepgram connect, so the first utterance comes back fast.
    prewarmAutofill();
  };

  const beginFromIntro = () => {
    session.set(INTRO_SEEN_KEY, '1');
    setIntro(null);
    listen(true);
  };

  const handleButton = () => {
    if (voice.recording) {
      voice.stop();
      setPanelOpen(true);
    } else if (hasSession) {
      listen(false);
    } else if (session.get(INTRO_SEEN_KEY) !== '1') {
      setIntro('start');
    } else {
      listen(true);
    }
  };

  const closePanel = () => {
    if (voice.recording) voice.stop();
    voice.dismissInterruption();
    setPanelOpen(false);
  };

  const startOver = () => {
    if (hasSession && !window.confirm('Start a new dictation? The transcript and activity log are cleared — entries already in the chart stay.')) return;
    if (voice.recording) voice.stop();
    voice.clear();
    setActivity([]);
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
    if (activity.length) {
      lines.push('', 'Activity', ''.padEnd(60, '─'));
      for (const a of activity) {
        lines.push(`[${a.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${a.description}`);
      }
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

  // Let the page scroll its last rows clear of the phone bottom sheet.
  React.useEffect(() => {
    if (!panelOpen) return;
    const cls = collapsed ? 'ai-panel-open--collapsed' : 'ai-panel-open';
    document.body.classList.add(cls);
    return () => document.body.classList.remove(cls);
  }, [panelOpen, collapsed]);

  const transcriptScroll = useStickToBottom<HTMLDivElement>(transcriptText + voice.interim);
  const activityScroll = useStickToBottom<HTMLDivElement>(activity.length);

  const sending = activeChunkCount > 0;
  const label = voice.recording ? 'Stop' : hasSession ? 'Resume' : 'AI autofill';
  const subLabel = voice.recording
    ? (sending ? 'listening · sending…' : 'listening')
    : sending ? 'finishing…' : null;
  const className = ['voice-input', voice.recording ? 'voice-input--recording' : '', sending ? 'voice-input--processing' : ''].filter(Boolean).join(' ');

  const status = voice.recording
    ? { text: 'Listening', cls: 'ai-sidebar__status--live' }
    : voice.interrupted
      ? { text: 'Interrupted', cls: 'ai-sidebar__status--warn' }
      : sending
        ? { text: 'Finishing…', cls: '' }
        : { text: 'Stopped', cls: '' };

  const lastActivity = activity[activity.length - 1];
  // One-line summary for the collapsed panel: what's being heard right
  // now, else the latest chart change, else a prompt.
  const peek = voice.interim
    ? { text: voice.interim, cls: 'ai-sidebar__peek--interim' }
    : lastActivity
      ? { text: lastActivity.description, cls: lastActivity.skipped ? 'ai-sidebar__peek--skipped' : '' }
      : { text: voice.recording ? 'Start talking — findings appear as they’re charted.' : 'Press Resume to keep dictating.', cls: 'ai-sidebar__peek--empty' };

  const primary = voice.recording
    ? { text: 'Stop', onClick: () => voice.stop(), cls: 'ai-sidebar__primary--stop' }
    : { text: hasSession ? 'Resume' : 'Start', onClick: () => listen(!hasSession), cls: '' };

  return (
    <div className="voice-input-wrap">
      <button
        type="button"
        className={className}
        onClick={handleButton}
        aria-pressed={voice.recording}
        title={voice.recording ? 'Stop listening (the transcript is kept)' : 'AI autofill — dictate to fill the chart'}
      >
        {voice.recording && <span className="voice-input__rec-dot" aria-hidden="true" />}
        <span className="voice-input__label">{label}</span>
        {subLabel && <span className="voice-input__sublabel">{subLabel}</span>}
      </button>

      {/* How-it-works modal. Portaled to <body> so it isn't trapped by the
          topbar's backdrop-filter containing block (which would clip a
          position:fixed overlay to the short topbar). */}
      {intro && ReactDOM.createPortal(
        <div className="ai-settings-overlay" onClick={() => setIntro(null)} role="dialog" aria-modal="true" aria-label="AI autofill">
          <div className="ai-settings-modal ai-intro" ref={introRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <header className="ai-settings-header">
              <h2>AI voice autofill</h2>
              <button type="button" className="pdf-preview-close" onClick={() => setIntro(null)} aria-label="Close">×</button>
            </header>
            <div className="ai-settings-body">
              <p className="ai-intro__lead">Dictate your findings and the AI charts them for you — no typing, hands on the patient.</p>
              <ul className="ai-intro__list">
                <li>Speak naturally: <em>“104 GI 2, calc 1, T/FX/CCF. 105 missing.”</em></li>
                <li>It fills <strong>the section you’re on</strong> — open Charting for perio values, Exam for exam findings, and so on. On Charting, diagnosis codes (T/FX, CCF…) also go onto the Diagnosis diagram.</li>
                <li>A live panel shows the <strong>transcript</strong> and every <strong>change</strong> as it lands; each value is highlighted in the chart.</li>
                <li><strong>Stop</strong> any time — press the button again to carry on with the same transcript. <strong>New</strong> in the panel starts over.</li>
                <li>Something wrong? Press <kbd>⌘Z</kbd> in a diagram, or just say the correction.</li>
              </ul>
              <p className="ai-intro__foot">Uses {voice.provider === 'deepgram' ? 'Deepgram Nova-3 Medical, tuned for clinical terms + speaker labels' : 'your browser’s speech recognition'}.</p>
            </div>
            <footer className="ai-settings-footer">
              {intro === 'start' ? (
                <>
                  <button type="button" className="diagram-view__action" onClick={() => setIntro(null)}>Cancel</button>
                  <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={beginFromIntro}>
                    Start dictation
                  </button>
                </>
              ) : (
                <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={() => setIntro(null)}>
                  Got it
                </button>
              )}
            </footer>
          </div>
        </div>,
        document.body
      )}

      {/* Live panel. Portaled to <body> for the same containing-block
          reason as the modal above. */}
      {panelOpen && ReactDOM.createPortal(
        <aside
          className={`ai-sidebar${collapsed ? ' ai-sidebar--collapsed' : ''}${voice.recording ? ' ai-sidebar--live' : ''}`}
          aria-label="AI autofill"
        >
          <header className="ai-sidebar__head">
            <button
              type="button"
              className="ai-sidebar__toggle"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
            >
              <span className={`ai-sidebar__status ${status.cls}`}>
                {voice.recording && <span className="voice-input__rec-dot" aria-hidden="true" />}
                {status.text}
              </span>
              <span className="ai-sidebar__chevron" aria-hidden="true">{collapsed ? '▴' : '▾'}</span>
            </button>
            <button type="button" className={`ai-sidebar__primary ${primary.cls}`} onClick={primary.onClick}>
              {primary.text}
            </button>
            <button type="button" className="ai-sidebar__icon" onClick={closePanel} aria-label="Close panel" title="Close (the transcript is kept)">
              ×
            </button>
          </header>

          {collapsed ? (
            <button type="button" className={`ai-sidebar__peek ${peek.cls}`} onClick={toggleCollapsed} aria-live="polite">
              {peek.text}
            </button>
          ) : (
            <>
              {voice.interrupted && !voice.recording && (
                <div className="ai-sidebar__notice" role="alert">
                  The microphone was interrupted (camera, phone call, or leaving the page). Everything heard before that was kept — press <strong>Resume</strong> to carry on.
                </div>
              )}

              <div className="ai-sidebar__section-label">Transcript</div>
              <div className="ai-sidebar__transcript" ref={transcriptScroll.ref} onScroll={transcriptScroll.onScroll} aria-live="polite">
                {transcriptText || voice.interim ? (
                  <>
                    {transcriptText}
                    {voice.interim && <span className="ai-sidebar__interim"> {voice.interim}</span>}
                  </>
                ) : (
                  <span className="ai-sidebar__empty">
                    {voice.recording ? 'Start talking — your words appear here.' : 'Press Start to dictate.'}
                  </span>
                )}
              </div>

              <div className="ai-sidebar__section-label">
                Activity
                {sending && <span className="ai-sidebar__sending">sending…</span>}
              </div>
              <div className="ai-sidebar__activity" ref={activityScroll.ref} onScroll={activityScroll.onScroll}>
                {activity.length === 0 ? (
                  <div className="ai-sidebar__empty">Chart changes show here as the AI applies them.</div>
                ) : (
                  activity.map((entry) => (
                    <div key={entry.id} className={`ai-sidebar__row${entry.skipped ? ' ai-sidebar__row--skipped' : ''}`}>
                      <span className="ai-sidebar__row-time">{entry.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>
                      <span className="ai-sidebar__row-desc">{entry.description}</span>
                    </div>
                  ))
                )}
              </div>

              <footer className="ai-sidebar__foot">
                <button type="button" className="ai-sidebar__link" onClick={startOver} disabled={!hasSession}>New</button>
                <button type="button" className="ai-sidebar__link" onClick={handleDownloadTranscript} disabled={!transcriptText}>Download</button>
                <button type="button" className="ai-sidebar__link" onClick={() => setIntro('info')}>How it works</button>
                <span className="voice-input__provider-badge">{voice.provider === 'deepgram' ? '⚡ Deepgram' : 'Browser STT'}</span>
              </footer>
            </>
          )}

          {error && <div className="voice-input__error voice-input__error--inline" role="alert">{error}</div>}
        </aside>,
        document.body
      )}

      {error && !panelOpen && <div className="voice-input__error" role="alert">{error}</div>}
    </div>
  );
};
