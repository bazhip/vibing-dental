import React from 'react';
import { useTranslation } from 'react-i18next';
import { useModalFocus } from '../hooks/useModalFocus';
import { isNativeApp } from '../native/platform';
import { buildAppSteps } from '../ios/tourSteps';

interface WalkthroughModalProps {
  open: boolean;
  onClose: () => void;
  /** Whether AI autofill applies to this account (Pro) — shows that step. */
  aiEnabled?: boolean;
  ownerReportEnabled?: boolean;
  /** A short task-based introduction; Help opens the full tour by default. */
  firstRun?: boolean;
  /** Switch the app to a chart section so the step's target is on screen. */
  onNavigate?: (sectionId: string) => void;
}

type StepId = 'firstPatient' | 'firstFinding' | 'firstOutput' | 'welcome' | 'sections' | 'patient' | 'grid' | 'byTooth' | 'customize' | 'diagrams' | 'images' | 'treatment' | 'ownerReport' | 'library' | 'dictate' | 'settings' | 'pdf';

export interface Step {
  /** Catalog id: onboarding:walkthrough.steps.<id>.title / .body. */
  id: StepId;
  /** Chart section to switch to before showing this step. */
  section?: string;
  /** CSS selector for the element to point at. Omit for a centered step. */
  target?: string;
  /** Preferred popover side relative to the target. */
  placement?: 'bottom' | 'top' | 'left' | 'right';
}

/** A step ready to show: its place on screen plus its text in the active language. */
export type TourStep = Omit<Step, 'id'> & { title: string; body: string };

/** The website tour's steps (the app's are in src/ios/tourSteps.ts). */
export function buildSteps(aiEnabled?: boolean, ownerReportEnabled?: boolean): Step[] {
  const steps: Step[] = [
    { id: 'welcome' },
    { id: 'sections', target: '.sidebar-layout__nav', placement: 'right' },
    { id: 'patient', section: 'patient', target: '[data-tour="patient-name"]', placement: 'bottom' },
    { id: 'grid', section: 'charting', target: '.dental-grid, .tooth-chart', placement: 'top' },
    { id: 'byTooth', section: 'charting', target: '.charting-view-switch', placement: 'bottom' },
    { id: 'customize', section: 'charting', target: '.charting-header-actions', placement: 'bottom' },
    { id: 'diagrams', section: 'diagnosis', target: '.tooth-diagram-wrapper', placement: 'right' },
    { id: 'images', section: 'imaging', target: '.radiographic-findings', placement: 'bottom' },
    { id: 'treatment', section: 'treatment', target: '.surgery-report__header', placement: 'bottom' },
    ...(ownerReportEnabled ? [{ id: 'ownerReport' as const, section: 'owner-report', target: '.owner-report__block', placement: 'top' as const }] : []),
    { id: 'library', target: '[data-tour="library"]', placement: 'bottom' },
  ];
  if (aiEnabled) {
    steps.push({ id: 'dictate', target: '.voice-input', placement: 'bottom' });
  }
  steps.push(
    { id: 'settings', target: '[data-tour="practice-settings"]', placement: 'bottom' },
    { id: 'pdf', target: '.visit-export__button', placement: 'left' },
  );
  return steps;
}

function buildFirstRunSteps(app: boolean): Step[] {
  return [
    { id: 'firstPatient', section: 'patient', target: '[data-tour="patient-name"]', placement: 'bottom' },
    { id: 'firstFinding', section: 'charting', target: '.dental-grid, .tooth-chart', placement: 'top' },
    { id: 'firstOutput', section: 'charting', target: app ? '[data-app-tab="chart"] button[type="submit"][form="chart-form"]' : '.visit-export__button', placement: 'bottom' },
  ];
}

const GAP = 12; // px between the spotlight and the popover
const POP_W = 320;

export const WalkthroughModal: React.FC<WalkthroughModalProps> = ({ open, onClose, aiEnabled, ownerReportEnabled, firstRun = false, onNavigate }) => {
  const { t } = useTranslation('onboarding');
  const { t: tSettings } = useTranslation('settings');
  // The app's tour points at the app's chrome and speaks touch.
  const app = isNativeApp();
  const steps = React.useMemo<TourStep[]>(
    () =>
      app && !firstRun
        ? buildAppSteps(tSettings, aiEnabled, ownerReportEnabled)
        : (firstRun ? buildFirstRunSteps(app) : buildSteps(aiEnabled, ownerReportEnabled)).map(({ id, ...rest }) => ({
            ...rest,
            title: t(`walkthrough.steps.${id}.title`),
            body: t(`walkthrough.steps.${id}.body`),
          })),
    [app, t, tSettings, aiEnabled, ownerReportEnabled, firstRun],
  );
  const [i, setI] = React.useState(0);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const [tick, setTick] = React.useState(0); // forces re-measure

  React.useEffect(() => { if (open) setI(0); }, [open, firstRun]);

  // Keyboard users land on the primary button each step (and Tab stays
  // inside the tour via the shared focus trap).
  const popRef = useModalFocus<HTMLDivElement>(open);
  const nextRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (open) window.setTimeout(() => nextRef.current?.focus(), 0);
  }, [open, i]);

  const stepIndex = Math.min(i, steps.length - 1);
  const step = steps[stepIndex];

  // Switch section, then measure the target (after it renders + scrolls in).
  React.useEffect(() => {
    if (!open) return;
    let raf1 = 0, raf2 = 0, to = 0;
    if (step.section) onNavigate?.(step.section);
    const measure = () => {
      if (!step.target) { setRect(null); return; }
      const el = document.querySelector(step.target) as HTMLElement | null;
      // Missing or hidden target (e.g. the section rail on phones): show
      // the step centred rather than spotlighting an empty corner.
      if (!el || el.getClientRects().length === 0) { setRect(null); return; }
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      raf2 = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setRect(r.width > 0 && r.height > 0 ? r : null);
      });
    };
    // Let the section switch/scroll settle before measuring.
    to = window.setTimeout(() => { raf1 = requestAnimationFrame(measure); }, step.section ? 90 : 0);
    return () => { clearTimeout(to); cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [open, i, tick, step, onNavigate]);

  React.useEffect(() => {
    if (!open) return;
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, steps.length - 1));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, steps.length]);

  if (!open) return null;
  const last = stepIndex === steps.length - 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Popover position: centered when no target; otherwise beside the target,
  // flipped/clamped to stay on screen.
  let popStyle: React.CSSProperties;
  if (!rect) {
    popStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  } else {
    const place = step.placement ?? 'bottom';
    let top = 0, left = 0;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const POP_H = 190; // estimate for flip/clamp math
    if (place === 'bottom' && rect.bottom + GAP + POP_H < vh) { top = rect.bottom + GAP; left = cx - POP_W / 2; }
    else if (place === 'top' && rect.top - GAP - POP_H > 0) { top = rect.top - GAP - POP_H; left = cx - POP_W / 2; }
    else if (place === 'left' && rect.left - GAP - POP_W > 0) { top = cy - POP_H / 2; left = rect.left - GAP - POP_W; }
    else if (place === 'right' && rect.right + GAP + POP_W < vw) { top = cy - POP_H / 2; left = rect.right + GAP; }
    else if (rect.bottom + GAP + POP_H < vh) { top = rect.bottom + GAP; left = cx - POP_W / 2; } // fallback below
    else { top = rect.top - GAP - POP_H; left = cx - POP_W / 2; } // fallback above
    // Clamp to viewport.
    left = Math.max(12, Math.min(left, vw - POP_W - 12));
    top = Math.max(12, Math.min(top, vh - 200));
    popStyle = { top, left, width: POP_W };
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={t('walkthrough.aria')}>
      {/* Spotlight: a transparent ring over the target with a huge shadow
          that dims everything else. When no target, a plain dimmer. */}
      {rect ? (
        <div
          className="tour__spotlight"
          style={{
            top: rect.top - 6, left: rect.left - 6,
            width: rect.width + 12, height: rect.height + 12,
          }}
        />
      ) : (
        <div className="tour__dim" onClick={onClose} />
      )}

      <div className="tour__pop" style={popStyle} ref={popRef} tabIndex={-1}>
        <div className="tour__eyebrow">{t('walkthrough.progress', { current: stepIndex + 1, total: steps.length })}</div>
        <h3 className="tour__title">{step.title}</h3>
        <p className="tour__body">{step.body}</p>
        <div className="tour__foot">
          <div className="tour__dots" aria-hidden="true">
            {steps.map((_, n) => <span key={n} className={`tour__dot${n === stepIndex ? ' tour__dot--on' : ''}`} />)}
          </div>
          <div className="tour__nav">
            <button type="button" className="tour__skip" onClick={onClose}>{t('walkthrough.skip')}</button>
            {i > 0 && <button type="button" className="diagram-view__action" onClick={() => setI((n) => n - 1)}>{t('walkthrough.back')}</button>}
            <button
              ref={nextRef}
              type="button"
              className="entry-grid__button entry-grid__button--topbar"
              onClick={() => (last ? onClose() : setI((n) => n + 1))}
            >
              {last ? t('walkthrough.finish') : t('walkthrough.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
