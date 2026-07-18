import React from 'react';

interface WalkthroughModalProps {
  open: boolean;
  onClose: () => void;
  /** Whether AI autofill applies to this account (Pro) — shows that step. */
  aiEnabled?: boolean;
  /** Switch the app to a chart section so the step's target is on screen. */
  onNavigate?: (sectionId: string) => void;
}

interface Step {
  /** Chart section to switch to before showing this step. */
  section?: string;
  /** CSS selector for the element to point at. Omit for a centered step. */
  target?: string;
  title: string;
  body: React.ReactNode;
  /** Preferred popover side relative to the target. */
  placement?: 'bottom' | 'top' | 'left' | 'right';
}

function buildSteps(aiEnabled?: boolean): Step[] {
  const steps: Step[] = [
    {
      title: 'Welcome to ToothOps',
      body: 'A 60-second tour of where everything lives. You can replay it any time from Settings → Getting started.',
    },
    {
      target: '.sidebar-layout__nav',
      placement: 'right',
      title: 'The eight sections',
      body: 'A dental record, top to bottom. Work down these in order or jump around — everything autosaves.',
    },
    {
      section: 'patient',
      target: 'input[placeholder="Enter patient name"]',
      placement: 'bottom',
      title: 'Patient & owner',
      body: 'Name, owner contact, and the recheck date. Only the patient name is required to save.',
    },
    {
      section: 'patient',
      target: '.patient-form__selectors',
      placement: 'top',
      title: 'Species & dentition',
      body: 'Pick Feline or Canine, then Permanent or Deciduous — the tooth layout follows.',
    },
    {
      section: 'charting',
      target: '.dental-grid',
      placement: 'top',
      title: 'The charting grid',
      body: 'Per-tooth measurements. Tab moves across, Enter moves down — chart without looking up.',
    },
    {
      section: 'diagnosis',
      target: '.tooth-diagram-wrapper',
      placement: 'right',
      title: 'Diagrams',
      body: 'Click a tooth to mark it; switch between Comment and Draw, add free notes. Undo with ⌘Z.',
    },
    {
      section: 'diagnosis',
      target: '.diagram-with-codes__codes',
      placement: 'left',
      title: 'Code reference',
      body: 'Search the full AVDC code set here; it stays pinned beside the diagram as you scroll.',
    },
    {
      section: 'treatment',
      target: '.dental-grid-section',
      placement: 'top',
      title: 'Treatment report & templates',
      body: 'Write the report, or insert a saved template from the dropdown — and save new ones to reuse.',
    },
    {
      target: '.topbar-library-btn',
      placement: 'bottom',
      title: 'My charts',
      body: 'Reopen a patient’s past visits (read-only until you Edit), switch visits by date, start a new patient, or load a chart PDF.',
    },
  ];
  if (aiEnabled) {
    steps.push({
      target: '.voice-input',
      placement: 'bottom',
      title: 'AI voice autofill',
      body: 'Dictate and the AI charts it for you, showing every change in a live sidebar so you can undo anything.',
    });
  }
  steps.push(
    {
      target: '.chart-menu__trigger',
      placement: 'bottom',
      title: 'Settings',
      body: 'Practice name & logo, team, recheck-reminder templates, your account — and this tour.',
    },
    {
      target: '.fab-download',
      placement: 'left',
      title: 'Preview & download the PDF',
      body: 'Build the client-ready chart PDF with your logo whenever you’re ready.',
    }
  );
  return steps;
}

const GAP = 12; // px between the spotlight and the popover
const POP_W = 320;

export const WalkthroughModal: React.FC<WalkthroughModalProps> = ({ open, onClose, aiEnabled, onNavigate }) => {
  const steps = React.useMemo(() => buildSteps(aiEnabled), [aiEnabled]);
  const [i, setI] = React.useState(0);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const [tick, setTick] = React.useState(0); // forces re-measure

  React.useEffect(() => { if (open) setI(0); }, [open]);

  const step = steps[i];

  // Switch section, then measure the target (after it renders + scrolls in).
  React.useEffect(() => {
    if (!open) return;
    let raf1 = 0, raf2 = 0, to = 0;
    if (step.section) onNavigate?.(step.section);
    const measure = () => {
      if (!step.target) { setRect(null); return; }
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (!el) { setRect(null); return; }
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      raf2 = requestAnimationFrame(() => setRect(el.getBoundingClientRect()));
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
  const last = i === steps.length - 1;
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
    <div className="tour" role="dialog" aria-modal="true" aria-label="Getting started">
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

      <div className="tour__pop" style={popStyle}>
        <div className="tour__eyebrow">{i + 1} of {steps.length}</div>
        <h3 className="tour__title">{step.title}</h3>
        <p className="tour__body">{step.body}</p>
        <div className="tour__foot">
          <div className="tour__dots" aria-hidden="true">
            {steps.map((_, n) => <span key={n} className={`tour__dot${n === i ? ' tour__dot--on' : ''}`} />)}
          </div>
          <div className="tour__nav">
            <button type="button" className="tour__skip" onClick={onClose}>Skip</button>
            {i > 0 && <button type="button" className="diagram-view__action" onClick={() => setI((n) => n - 1)}>Back</button>}
            <button
              type="button"
              className="entry-grid__button entry-grid__button--topbar"
              onClick={() => (last ? onClose() : setI((n) => n + 1))}
            >
              {last ? 'Get charting' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
