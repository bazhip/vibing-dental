import React from 'react';
import ReactDOM from 'react-dom';
import { Trans, useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { formatDateTime, formatList } from '../i18n/format';
import { confirmDialog, toast } from './ui/dialogs';
import { errorText } from '../utils/apiErrors';
import { useVoiceCapture, FinalSegment } from '../hooks/useVoiceCapture';
import { useModalFocus } from '../hooks/useModalFocus';
import { useWakeLock } from '../hooks/useWakeLock';
import {
  extractChartActions,
  reviewFullTranscript,
  ExtractResult,
  applyAiActions,
  dedupeActions,
  normalizeTranscript,
  codeOnlyComment,
  ReviewFlag,
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
 * pauses; findings land wherever they belong, from any page.
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
    case 'append_radiographic_findings':
      return { section: 'imaging' };
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
  /** The chart is view-only (saved visit not unlocked): no dictation. */
  locked?: boolean;
  /** Open the feedback form, offering this session's transcript. */
  onOpenFeedback?: (transcript: string) => void;
}

interface ActivityEntry {
  id: string;
  description: string;
  at: Date;
  skipped?: boolean;
  uncertain?: boolean;
}

/** A finding the vet should check — see ReviewFlag. */
interface ReviewItem {
  id: string;
  flag: ReviewFlag;
  /** Undo the applied best guess (absent for questions, or when the
   *  change can't be cleanly undone). */
  revert?: () => void;
  /** Already announced in the earpiece. */
  spoken: boolean;
}

/** What an action writes to — two actions with the same target are the
 *  same finding, so a later clear statement resolves an earlier flag. */
function targetKey(a: AiAction): string {
  const i = a.input;
  switch (a.name) {
    case 'set_tooth_field': return `field:${i.triadan}:${i.field}`;
    case 'set_tooth_mark':
    case 'unset_tooth_mark': return `mark:${i.diagram === 'post' ? 'post' : 'pre'}:${i.triadan}`;
    case 'add_comment': return `note:${i.diagram === 'post' ? 'post' : 'pre'}:${i.triadan ?? '-'}`;
    case 'set_exam_finding': return `exam:${i.area}`;
    case 'set_nerve_block': return `block:${i.site}`;
    case 'set_patient_field': return `patient:${i.field}`;
    default: return a.name;
  }
}

/** The activity line for a change: prefixed with where it landed when
 *  that isn't the page on screen ("→ Exam: tongue normal"), since the
 *  app stays put rather than jumping there. */
export function withDestination(a: AiAction, activeSection: string | undefined): string {
  const home = actionFocus(a, activeSection)?.section;
  const text = describeAction(a);
  const label = sectionLabel(home ?? '').replace(/\s*\(.*\)$/, '');
  return home && home !== activeSection ? i18n.t('activity.destination', { ns: 'voice', section: label, text }) : text;
}

/** Quiet this long (no words being heard) before a prompt is spoken, so
 *  the earpiece never talks over the vet. */
const PROMPT_SILENCE_MS = 4_000;
const VOICE_PROMPTS_KEY = 'ai.voicePrompts';

function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** "Check 109", "Check 109 and 204", "Check 109, 204 and 308" (spoken, in the active language). */
function promptFor(items: ReviewItem[]): string {
  const teeth = Array.from(new Set(items.map((r) => r.flag.triadan).filter((t): t is number => typeof t === 'number')));
  const others = items.filter((r) => typeof r.flag.triadan !== 'number').length;
  const parts = teeth.map(String);
  if (others) parts.push(i18n.t('spoken.finding', { ns: 'voice', count: others }));
  if (parts.length === 0) return '';
  return i18n.t('spoken.check', { ns: 'voice', list: formatList(parts) });
}

/** Safety-net flush while recording, in case no pause is ever detected. */
const CHUNK_INTERVAL_MS = 15_000;
/** Send once the speaker has been quiet this long after a final segment… */
const QUIET_FLUSH_MS = 1_200;
/** …or longer when the segment stops mid-finding ("105 GI two calc"),
 *  since the value is probably coming in the next breath. */
const DANGLING_FLUSH_MS = 2_500;
// Ends on a score word with no number yet, or on a bare tooth number.
export const DANGLING_RE = /(?:\b(?:GI|GE|G|enlargement|calc|calculus|mobility|mob|pocket|furcation|F|PD|stage|grade|class|recession|and)|\b[1-8][0-1]\d)\s*[,.]?\s*$/i;
/** …or once speech has been pending this long, whichever comes first. */
const MAX_PENDING_MS = 6_000;
const RECENT_CONTEXT_MS = 90_000;

const ROW_TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit' };

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
  // The box also changes height (a review card appears, the sheet
  // expands): keep it pinned through that too.
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
  return { ref, onScroll };
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  context, handlers, onActivity, activeSection, sessionKey, locked = false, onOpenFeedback}) => {
  const { t } = useTranslation('voice');
  const [activeChunkCount, setActiveChunkCount] = React.useState(0);
  const [activity, setActivity] = React.useState<ActivityEntry[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  /** 'start' = first-run intro with a Start button; 'info' = reopened
   *  from the panel, just a Close button. */
  const [intro, setIntro] = React.useState<null | 'start' | 'info'>(null);
  const introRef = useModalFocus(intro !== null);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [reviews, setReviews] = React.useState<ReviewItem[]>([]);
  const reviewsRef = React.useRef(reviews);
  reviewsRef.current = reviews;
  const [voicePrompts, setVoicePrompts] = React.useState(() => {
    try { return window.localStorage.getItem(VOICE_PROMPTS_KEY) !== 'off'; } catch { return true; }
  });
  const toggleVoicePrompts = () => {
    setVoicePrompts((v) => {
      try { window.localStorage.setItem(VOICE_PROMPTS_KEY, v ? 'off' : 'on'); } catch { /* ignore */ }
      if (v && speechAvailable()) window.speechSynthesis.cancel();
      return !v;
    });
  };
  /** performance.now() of the last sign of speech (words being heard). */
  const lastSpeechRef = React.useRef(0);
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
  /** Changes the vet rejected in review; the final check won't re-add them. */
  const rejectedRef = React.useRef<AiAction[]>([]);
  /** Bumps when the dictation is thrown away (New, another chart): a
   *  result that comes back afterwards must not land on that chart. */
  const sessionGenRef = React.useRef(0);
  /** Segments the last final check covered — Stop again with nothing new
   *  said (Stop → Resume → Stop) doesn't pay for another whole-transcript
   *  pass. */
  const finalCheckedSegmentsRef = React.useRef(0);
  const resetSessionMemory = () => {
    sessionGenRef.current++;
    finalCheckedSegmentsRef.current = 0;
    rejectedRef.current = [];
  };
  const lockedRef = React.useRef(locked);
  lockedRef.current = locked;
  const voiceRef = React.useRef<ReturnType<typeof useVoiceCapture> | null>(null);

  // Activity lines are written from processChunk (a callback with [] deps), so they
  // look up the language in effect now rather than the render-bound `t`.
  const appendActivity = (actions: AiAction[], skipped: AiAction[] = [], uncertain: Set<AiAction> = new Set()) => {
    if (!actions.length && !skipped.length) return;
    const tNow = i18n.getFixedT(null, 'voice');
    const now = new Date();
    setActivity((prev) => [
      ...prev,
      ...actions.map((a, i) => ({
        id: `${now.getTime()}_${i}`,
        description: withDestination(a, sectionRef.current),
        at: now,
        uncertain: uncertain.has(a),
      })),
      ...skipped.map((a, i) => {
        const home = actionFocus(a)?.section;
        return {
          id: `${now.getTime()}_s${i}`,
          description: home
            ? tNow('activity.notAppliedHome', { section: sectionLabel(home), what: describeAction(a) })
            : tNow('activity.notApplied', { what: describeAction(a) }),
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
    // The AI gets the annotated text: low-confidence words marked [?…].
    const delta = segments.map((s) => s.annotated ?? s.text).join(' ').trim();
    if (!delta) return;
    const sentSet = new Set(segments.map((s) => s.receivedAt));
    const contextSegments = voiceRef.current.recentSegments(RECENT_CONTEXT_MS).filter((s) => !sentSet.has(s.receivedAt));
    const recentContext = contextSegments.map((s) => s.text).join(' ').trim();

    const gen = sessionGenRef.current;
    inFlightRef.current = true;
    setActiveChunkCount((c) => c + 1);
    try {
      const result = await extractChartActions({ delta, recentContext, context: contextRef.current, section, lng: voiceRef.current?.lng ?? 'en' });
      if (gen === sessionGenRef.current) applyResult(result);
    } catch (err) {
      console.error('[VoiceInputButton] chunk extraction failed', err);
      setError(errorText(err, i18n.getFixedT(null, 'voice')('errors.failed')));
    } finally {
      inFlightRef.current = false;
      setActiveChunkCount((c) => c - 1);
      const wasQueued = queuedFlushRef.current;
      queuedFlushRef.current = false;
      if (wasQueued || final) setTimeout(() => { processChunk(final).catch(console.error); }, 0);
    }
  }, []);

  /** Apply an extraction result: chart changes, review items, activity.
   *  Returns how many new review items it raised. */
  function applyResult(result: ExtractResult): number {
      const before = contextRef.current;
      const fresh = dedupeActions(result.actions, before);
      // Undo info has to be captured from the chart BEFORE applying.
      const reverts = new Map<AiAction, (() => void) | undefined>();
      for (const f of result.flags) if (f.applied) reverts.set(f.applied, revertFor(f.applied, before));
      const applied = applyAiActions(fresh, handlersRef.current);
      const appliedSet = new Set(applied);

      const newItems: ReviewItem[] = [];
      for (const f of result.flags) {
        if (f.applied && !fresh.includes(f.applied)) continue; // already on the chart
        const wasApplied = !!f.applied && appliedSet.has(f.applied);
        newItems.push({
          id: `rv${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          flag: wasApplied ? f : { ...f, applied: undefined },
          revert: wasApplied ? reverts.get(f.applied!) : undefined,
          spoken: false,
        });
      }
      const flaggedActions = new Set(newItems.map((r) => r.flag.applied).filter(Boolean) as AiAction[]);
      // A clear (unflagged) statement about the same thing settles an
      // earlier flag — the vet just said the correction out loud.
      const settled = applied.filter((a) => !flaggedActions.has(a));
      if (settled.length || newItems.length) {
        setReviews((prev) => {
          const keys = new Set(settled.map(targetKey));
          const teeth = new Set(settled.map((a) => a.input.triadan).filter((t) => t != null));
          const remaining = prev.filter((r) => {
            if (r.flag.applied) return !keys.has(targetKey(r.flag.applied));
            const optKeys = r.flag.options.map((o) => targetKey(o.action));
            return !optKeys.some((k) => keys.has(k)) && !(r.flag.triadan != null && teeth.has(r.flag.triadan));
          });
          return [...remaining, ...newItems];
        });
      }
      appendActivity(applied, result.skipped, flaggedActions);
      return newItems.length;
  }

  const waitIdle = async () => {
    while (inFlightRef.current) await new Promise((r) => setTimeout(r, 100));
  };

  /** Send everything still pending and wait for every result to land —
   *  stopping never cuts off speech that hasn't been charted yet. */
  const drain = async () => {
    for (let i = 0; i < 10; i++) {
      await waitIdle();
      await processChunk(false);
      // Let a flush queued behind that request start.
      await new Promise((r) => setTimeout(r, 0));
      if (!inFlightRef.current) break;
    }
    await waitIdle();
  };

  /**
   * After dictation stops: one pass over the whole transcript against the
   * chart, catching what per-utterance extraction missed (findings split
   * across chunks, corrections, things said fast). Its changes all go to
   * Needs review.
   */
  const runFinalCheck = async () => {
    // Read the language when the check finishes (this runs from a callback created once).
    const tNow = i18n.getFixedT(null, 'voice');
    await drain();
    if (lockedRef.current) return; // view-only now: change nothing
    const segments = voiceRef.current?.allSegments() ?? [];
    const transcript = segments.map((s) => s.annotated ?? s.text).join('\n').trim();
    if (!transcript) return;
    // Nothing new since the last final check: it would re-read the same
    // transcript against a chart it already checked.
    if (segments.length <= finalCheckedSegmentsRef.current) return;
    // Let React commit the last chunk's chart changes into contextRef.
    await new Promise((r) => setTimeout(r, 150));
    if (inFlightRef.current) await waitIdle();
    const gen = sessionGenRef.current;
    inFlightRef.current = true;
    setActiveChunkCount((c) => c + 1);
    try {
      const result = await reviewFullTranscript({
        transcript,
        context: contextRef.current,
        rejected: rejectedRef.current,
        lng: voiceRef.current?.lng ?? 'en',
      });
      if (!result.ran || gen !== sessionGenRef.current) return;
      finalCheckedSegmentsRef.current = segments.length;
      const raised = applyResult(result);
      const now = new Date();
      setActivity((prev) => [...prev, {
        id: `${now.getTime()}_final`,
        description: raised
          ? tNow('activity.finalRaised', { count: raised })
          : tNow('activity.finalNone'),
        at: now,
      }].slice(-200));
      if (raised) {
        setPanelOpen(true);
        setCollapsed(false);
        if (voicePromptsRef.current && !voiceRef.current?.recording) {
          speak(tNow('spoken.finalFound', { count: raised }));
        }
      }
    } catch (err) {
      console.error('[VoiceInputButton] final check failed', err);
      setError(err instanceof Error ? tNow('errors.finalCheckFailedDetail', { message: err.message }) : tNow('errors.finalCheckFailed'));
    } finally {
      inFlightRef.current = false;
      setActiveChunkCount((c) => c - 1);
      if (queuedFlushRef.current) {
        queuedFlushRef.current = false;
        processChunk(false).catch(console.error);
      }
    }
  };

  /** How to take back `a` if the vet rejects it, from the chart as it was
   *  just before. Undefined when there's no clean undo. */
  function revertFor(a: AiAction, before: ChartContext): (() => void) | undefined {
    const h = () => handlersRef.current;
    const i = a.input;
    const t = Number(i.triadan);
    const post = i.diagram === 'post';
    switch (a.name) {
      case 'set_tooth_field': {
        const tooth = before.toothData.find((x) => x.triadan === t);
        const prior = tooth ? String(tooth[i.field as keyof typeof tooth] ?? '') : '';
        return () => h().setToothField(t, i.field as never, prior);
      }
      case 'set_tooth_mark':
      case 'unset_tooth_mark': {
        const prior = (post ? before.postMarks : before.preMarks)[t] ?? null;
        return () => (post ? h().setPostMark : h().setPreMark)(t, prior as never);
      }
      case 'add_comment': {
        const text = codeOnlyComment(String(i.text ?? ''));
        return () => h().removeComment(post ? 'post' : 'pre', i.triadan != null ? t : null, text);
      }
      default:
        return undefined;
    }
  }

  const resolveReview = (id: string, choice: 'keep' | 'remove' | { label: string; action: AiAction }) => {
    const item = reviewsRef.current.find((r) => r.id === id);
    if (!item) return;
    setReviews((prev) => prev.filter((r) => r.id !== id));
    const now = new Date();
    if (choice === 'keep') return;
    if (item.flag.applied) rejectedRef.current.push(item.flag.applied);
    item.revert?.();
    if (choice === 'remove') {
      if (item.flag.applied) {
        setActivity((prev) => [...prev, { id: `${now.getTime()}_r`, description: i18n.getFixedT(null, 'voice')('activity.removed', { what: describeAction(item.flag.applied!) }), at: now }]);
      }
      return;
    }
    const applied = applyAiActions([choice.action], handlersRef.current);
    appendActivity(applied);
  };

  const showReview = (item: ReviewItem) => {
    const a = item.flag.applied ?? item.flag.options[0]?.action;
    if (a) onActivityRef.current?.([a]);
  };

  const onStop = React.useCallback(async (_t: string) => {
    await runFinalCheck(); // drains every pending chunk first
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processChunk]);
  // Send each utterance as soon as the speaker pauses, rather than on a
  // fixed timer; cap the wait so continuous speech still flows.
  const onSegment = React.useCallback((seg: FinalSegment) => {
    lastSpeechRef.current = performance.now();
    const flush = () => { processChunk(false).catch(console.error); };
    const dangling = DANGLING_RE.test(normalizeTranscript(seg.text, voiceRef.current?.lng ?? 'en'));
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
  // Keep the screen on while dictating: on a phone, the screen sleeping
  // cuts the mic and ends the session.
  useWakeLock(voice.recording);
  // First words of a listen: warm the prompt cache now — the warm-up
  // races the first utterance's pause (~1–2 s), so the first chunk still
  // comes back fast. Skipped when the cache is still warm.
  const warmedThisListenRef = React.useRef(false);
  // Has anything been heard since this listen started? Until then the
  // panel says "Go ahead — start talking".
  const [heardSinceStart, setHeardSinceStart] = React.useState(false);
  React.useEffect(() => {
    if (voice.interim) lastSpeechRef.current = performance.now();
    if (voice.interim && !heardSinceStart) setHeardSinceStart(true);
    if (voice.interim && voice.recording && !warmedThisListenRef.current) {
      warmedThisListenRef.current = true;
      prewarmAutofill(voice.lng);
    }
  }, [voice.interim, voice.recording, heardSinceStart, voice.lng]);

  // The moment the mic is really live: a short buzz on phones that support
  // it. (No chime: playing audio through a second AudioContext while the
  // mic captures switched the device's audio session / sample rate and
  // corrupted the audio sent to Deepgram — the transcript went empty.)
  const wasReadyRef = React.useRef(false);
  React.useEffect(() => {
    const becameReady = voice.ready && !wasReadyRef.current;
    wasReadyRef.current = voice.ready;
    if (!becameReady || !voice.recording) return;
    try { navigator.vibrate?.(60); } catch { /* not supported */ }
  }, [voice.ready, voice.recording]);

  // ---- Earpiece prompts --------------------------------------------------
  // Spoken only after a stretch of silence, never over the vet. The mic is
  // muted while the app speaks so it doesn't transcribe itself.
  const voicePromptsRef = React.useRef(voicePrompts);
  voicePromptsRef.current = voicePrompts;
  const speakingRef = React.useRef(false);
  const speak = React.useCallback((text: string, onDone?: () => void) => {
    if (!text || !speechAvailable()) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    // English keeps the browser's default voice; other languages ask for theirs.
    if (i18n.language !== 'en') u.lang = i18n.language;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      speakingRef.current = false;
      voiceRef.current?.setMuted(false);
      // Our own voice isn't the vet's speech — restart the silence clock.
      lastSpeechRef.current = performance.now();
      onDone?.();
    };
    u.onend = finish;
    u.onerror = finish;
    speakingRef.current = true;
    voiceRef.current?.setMuted(true);
    window.speechSynthesis.speak(u);
    window.setTimeout(finish, 8000); // safety: never leave the mic muted
  }, []);

  React.useEffect(() => {
    if (!voice.recording || !voicePrompts) return;
    const id = window.setInterval(() => {
      if (speakingRef.current) return;
      if (performance.now() - lastSpeechRef.current < PROMPT_SILENCE_MS) return;
      const pending = reviewsRef.current.filter((r) => !r.spoken);
      if (pending.length === 0) return;
      const ids = new Set(pending.map((r) => r.id));
      setReviews((prev) => prev.map((r) => (ids.has(r.id) ? { ...r, spoken: true } : r)));
      speak(promptFor(pending));
    }, 500);
    return () => window.clearInterval(id);
  }, [voice.recording, voicePrompts, speak]);

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
  const hasSession = transcriptText.length > 0 || activity.length > 0 || reviews.length > 0;

  // Locked mid-dictation (Done editing): stop listening.
  React.useEffect(() => {
    if (locked && voiceRef.current?.recording) voiceRef.current.stop();
  }, [locked]);

  // A different chart: start over so nothing carries across patients.
  const prevKeyRef = React.useRef(sessionKey);
  React.useEffect(() => {
    if (prevKeyRef.current === sessionKey) return;
    prevKeyRef.current = sessionKey;
    if (voiceRef.current?.recording) voiceRef.current.stop();
    voiceRef.current?.clear();
    resetSessionMemory();
    setActivity([]);
    setReviews([]);
    setPanelOpen(false);
  }, [sessionKey]);

  const listen = (fresh: boolean) => {
    if (!voice.supported) {
      setError(t('errors.unsupported'));
      return;
    }
    setError(null);
    setPanelOpen(true);
    // iOS only lets a page speak after it has spoken inside a tap.
    if (voicePrompts && speechAvailable()) {
      try { window.speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch { /* ignore */ }
    }
    if (fresh) {
      resetSessionMemory();
      setActivity([]);
      setReviews([]);
      voice.start();
    } else {
      voice.resume();
    }
    // The prompt cache is warmed when speech actually starts (see the
    // interim effect), not here: opening Dictate without speaking used to
    // pay a full cache write every time.
    warmedThisListenRef.current = false;
    setHeardSinceStart(false);
  };

  const beginFromIntro = () => {
    session.set(INTRO_SEEN_KEY, '1');
    setIntro(null);
    listen(true);
  };

  /** Stop listening; if anything needs checking, say so and show it. */
  const stopListening = () => {
    voice.stop();
    const open = reviewsRef.current.length;
    if (open > 0) {
      setPanelOpen(true);
      setCollapsed(false);
      if (voicePrompts) speak(t('spoken.open', { count: open }));
    }
  };

  const handleButton = () => {
    if (locked && !voice.recording) {
      toast(t('toast.viewOnly', { button: t('topbar.editChart', { ns: 'app' }) }), { kind: 'info' });
      return;
    }
    if (voice.recording) {
      stopListening();
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

  const startOver = async () => {
    if (hasSession && !(await confirmDialog({
      title: t('dialog.title'),
      message: t('dialog.message'),
      confirmLabel: t('dialog.confirm'),
    }))) return;
    if (voice.recording) voice.stop();
    voice.clear();
    resetSessionMemory();
    setActivity([]);
    setReviews([]);
  };

  /** The session as text: timestamped transcript plus the activity log
   *  (what Download saves, and what feedback can attach). */
  const buildTranscriptText = (): string => {
    const segments = voice.allSegments();
    if (segments.length === 0) return '';
    const start = voice.startedAt ?? new Date();
    const startedPerf = segments[0]?.receivedAt ?? performance.now();
    const startedTs = start.getTime() - (performance.now() - startedPerf);
    const en = { lng: 'en', ns: 'voice' } as const;
    const lines = [i18n.t('transcript.header', { ...en, date: start.toLocaleString() }), ''.padEnd(60, '─'), ''];
    for (const seg of segments) {
      const wallTime = new Date(startedTs + (seg.receivedAt - startedPerf));
      const stamp = wallTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      lines.push(`[${stamp}] ${seg.text}`);
    }
    if (activity.length) {
      lines.push('', i18n.t('transcript.activity', en), ''.padEnd(60, '─'));
      for (const a of activity) {
        lines.push(`[${a.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${a.description}`);
      }
    }
    return lines.join('\n') + '\n';
  };

  const handleDownloadTranscript = () => {
    const text = buildTranscriptText();
    if (!text) return;
    const start = voice.startedAt ?? new Date();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
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
  const label = voice.recording ? t('button.stop') : hasSession ? t('button.resume') : t('button.dictate');
  const reviewLabel = reviews.length ? t('toReview', { count: reviews.length }) : null;
  // Recording but the mic isn't live yet: say so, so nobody talks into
  // the gap. Live but nothing heard yet: invite them to start.
  const connecting = voice.recording && !voice.ready;
  const goAhead = voice.recording && voice.ready && !heardSinceStart;
  const subLabel = connecting
    ? t('sub.connecting')
    : goAhead
    ? t('sub.goAhead')
    : voice.recording
    ? (sending ? t('sub.listeningSending') : reviewLabel ?? t('sub.listening'))
    : sending ? t('sub.finishing') : reviewLabel;
  const className = ['voice-input', voice.recording ? 'voice-input--recording' : '', sending ? 'voice-input--processing' : ''].filter(Boolean).join(' ');

  const status = connecting
    ? { text: t('status.connecting'), cls: 'ai-sidebar__status--connecting' }
    : goAhead
    ? { text: t('status.ready'), cls: 'ai-sidebar__status--live' }
    : voice.recording
    ? { text: t('status.listening'), cls: 'ai-sidebar__status--live' }
    : voice.interrupted
      ? { text: t('status.interrupted'), cls: 'ai-sidebar__status--warn' }
      : sending
        ? { text: t('status.finishing'), cls: '' }
        : { text: t('status.stopped'), cls: '' };

  const lastActivity = activity[activity.length - 1];
  // One-line summary for the collapsed panel: what's being heard right
  // now, else the latest chart change, else a prompt.
  const peek = voice.interim
    ? { text: voice.interim, cls: 'ai-sidebar__peek--interim' }
    : reviews.length
      ? { text: t('peek.review', { count: reviews.length }), cls: 'ai-sidebar__peek--review' }
    : lastActivity
      ? { text: lastActivity.description, cls: lastActivity.skipped ? 'ai-sidebar__peek--skipped' : '' }
      : connecting
      ? { text: t('peek.connecting'), cls: 'ai-sidebar__peek--empty' }
      : goAhead
      ? { text: t('peek.goAhead'), cls: 'ai-sidebar__peek--go' }
      : { text: voice.recording ? t('peek.talking') : t('peek.pressResume'), cls: 'ai-sidebar__peek--empty' };

  const primary = voice.recording
    ? { text: t('button.stop'), onClick: stopListening, cls: 'ai-sidebar__primary--stop' }
    : { text: hasSession ? t('button.resume') : t('button.start'), onClick: () => listen(!hasSession), cls: '' };

  return (
    <div className="voice-input-wrap">
      <button
        type="button"
        className={className}
        onClick={handleButton}
        aria-pressed={voice.recording}
        title={voice.recording ? t('button.titleStop') : t('button.titleDictate')}
      >
        {voice.recording ? (
          <span className={`voice-input__rec-dot${connecting ? ' voice-input__rec-dot--connecting' : ''}`} aria-hidden="true" />
        ) : (
          <svg className="voice-input__mic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
            <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        <span className="voice-input__label">{label}</span>
        {subLabel && <span className="voice-input__sublabel">{subLabel}</span>}
        {reviews.length > 0 && (
          <span className="voice-input__review-badge" aria-label={t('toReview', { count: reviews.length })}>{reviews.length}</span>
        )}
      </button>

      {/* How-it-works modal. Portaled to <body> so it isn't trapped by the
          topbar's backdrop-filter containing block (which would clip a
          position:fixed overlay to the short topbar). */}
      {intro && ReactDOM.createPortal(
        <div className="ai-settings-overlay" onClick={() => setIntro(null)} role="dialog" aria-modal="true" aria-label={t('intro.ariaLabel')}>
          <div className="ai-settings-modal ai-intro" ref={introRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <header className="ai-settings-header">
              <h2>{t('intro.title')}</h2>
              <button type="button" className="pdf-preview-close" onClick={() => setIntro(null)} aria-label={t('intro.close')}>×</button>
            </header>
            <div className="ai-settings-body">
              <ol className="ai-intro__list">
                <li><Trans t={t} i18nKey="intro.step1" components={{ em: <em /> }} /></li>
                <li>{t('intro.step2')}</li>
                <li><Trans t={t} i18nKey="intro.step3" components={{ strong: <strong /> }} /></li>
              </ol>
            </div>
            <footer className="ai-settings-footer">
              {intro === 'start' ? (
                <>
                  <button type="button" className="diagram-view__action" onClick={() => setIntro(null)}>{t('intro.cancel')}</button>
                  <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={beginFromIntro}>
                    {t('intro.start')}
                  </button>
                </>
              ) : (
                <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={() => setIntro(null)}>
                  {t('intro.gotIt')}
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
          className={`ai-sidebar${collapsed ? ' ai-sidebar--collapsed' : ''}${voice.recording ? ' ai-sidebar--live' : ''}${reviews.length ? ' ai-sidebar--has-review' : ''}`}
          aria-label={t('panel.ariaLabel')}
        >
          <header className="ai-sidebar__head">
            <button
              type="button"
              className="ai-sidebar__toggle"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-label={collapsed ? t('panel.expand') : t('panel.collapse')}
            >
              <span className={`ai-sidebar__status ${status.cls}`}>
                {voice.recording && <span className={`voice-input__rec-dot${connecting ? ' voice-input__rec-dot--connecting' : ''}`} aria-hidden="true" />}
                {status.text}
              </span>
              <span className="ai-sidebar__chevron" aria-hidden="true">{collapsed ? '▴' : '▾'}</span>
            </button>
            <button type="button" className={`ai-sidebar__primary ${primary.cls}`} onClick={primary.onClick}>
              {primary.text}
            </button>
            <button type="button" className="ai-sidebar__icon" onClick={closePanel} aria-label={t('panel.close')} title={t('panel.closeTitle')}>
              ×
            </button>
          </header>

          {collapsed ? (
            <button type="button" className={`ai-sidebar__peek ${peek.cls}`} onClick={toggleCollapsed} aria-live="polite">
              {peek.text}
            </button>
          ) : (
            <>
              {reviews.length > 0 && (
                <section className="ai-review" aria-label={t('panel.needsReview')}>
                  <div className="ai-sidebar__section-label ai-review__label">{t('panel.needsReviewCount', { count: reviews.length })}</div>
                  <ul className="ai-review__list">
                    {reviews.map((r) => (
                      <li key={r.id} className="ai-review__item">
                        <button type="button" className="ai-review__what" onClick={() => showReview(r)} title={t('panel.showInChart')}>
                          <span className="ai-review__heard">
                            {r.flag.applied ? describeAction(r.flag.applied) : t('panel.heard', { heard: r.flag.heard })}
                          </span>
                          <span className="ai-review__reason">
                            {r.flag.applied ? t('panel.guess', { reason: r.flag.reason }) : t('panel.notCharted', { reason: r.flag.reason })}
                          </span>
                        </button>
                        <div className="ai-review__actions">
                          {r.flag.options.map((o, i) => (
                            <button key={i} type="button" className="ai-review__opt" onClick={() => resolveReview(r.id, o)}>
                              {o.label}
                            </button>
                          ))}
                          {r.flag.applied && (
                            <button type="button" className="ai-review__opt ai-review__opt--keep" onClick={() => resolveReview(r.id, 'keep')}>
                              {t('panel.keep')}
                            </button>
                          )}
                          <button type="button" className="ai-review__opt ai-review__opt--quiet" onClick={() => resolveReview(r.id, 'remove')}>
                            {r.flag.applied && r.revert ? t('panel.remove') : t('panel.dismiss')}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {voice.interrupted && !voice.recording && (
                <div className="ai-sidebar__notice" role="alert">
                  <Trans t={t} i18nKey="panel.interrupted" components={{ strong: <strong /> }} />
                </div>
              )}

              <div className="ai-sidebar__section-label">{t('panel.transcript')}</div>
              <div className="ai-sidebar__transcript" ref={transcriptScroll.ref} onScroll={transcriptScroll.onScroll} aria-live="polite">
                {transcriptText || voice.interim ? (
                  <>
                    {transcriptText}
                    {voice.interim && <span className="ai-sidebar__interim"> {voice.interim}</span>}
                  </>
                ) : (
                  <span className="ai-sidebar__empty">
                    {connecting
                      ? t('panel.emptyConnecting')
                      : voice.recording
                      ? t('panel.emptyListening')
                      : t('panel.emptyIdle')}
                  </span>
                )}
              </div>

              <div className="ai-sidebar__section-label">
                {t('panel.activity')}
                {sending && <span className="ai-sidebar__sending">{t('panel.sending')}</span>}
              </div>
              <div className="ai-sidebar__activity" ref={activityScroll.ref} onScroll={activityScroll.onScroll}>
                {activity.length === 0 ? (
                  <div className="ai-sidebar__empty">{t('panel.activityEmpty')}</div>
                ) : (
                  activity.map((entry) => (
                    <div key={entry.id} className={`ai-sidebar__row${entry.skipped ? ' ai-sidebar__row--skipped' : ''}${entry.uncertain ? ' ai-sidebar__row--uncertain' : ''}`}>
                      <span className="ai-sidebar__row-time">{formatDateTime(entry.at, i18n.language, ROW_TIME)}</span>
                      <span className="ai-sidebar__row-desc">{entry.description}{entry.uncertain && <span className="ai-sidebar__row-flag" title={t('panel.guessMark')}> ?</span>}</span>
                    </div>
                  ))
                )}
              </div>

              <footer className="ai-sidebar__foot">
                <button type="button" className="ai-sidebar__link" onClick={startOver} disabled={!hasSession}>{t('panel.new')}</button>
                <button type="button" className="ai-sidebar__link" onClick={handleDownloadTranscript} disabled={!transcriptText}>{t('panel.download')}</button>
                {onOpenFeedback && (
                  <button type="button" className="ai-sidebar__link" onClick={() => onOpenFeedback(buildTranscriptText())} title={t('panel.feedbackTitle')}>
                    {t('panel.feedback')}
                  </button>
                )}
                <button type="button" className="ai-sidebar__link" onClick={() => setIntro('info')} title={t('panel.helpTitle')}>{t('panel.help')}</button>
                {speechAvailable() && (
                  <button
                    type="button"
                    className="ai-sidebar__link"
                    onClick={toggleVoicePrompts}
                    aria-pressed={voicePrompts}
                    title={t('panel.promptsTitle')}
                  >
                    {voicePrompts ? t('panel.promptsOn') : t('panel.promptsOff')}
                  </button>
                )}
                <span className="voice-input__provider-badge">{voice.provider === 'deepgram' ? t('panel.providerDeepgram') : t('panel.providerBrowser')}</span>
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
