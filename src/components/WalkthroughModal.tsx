import React from 'react';
import { useModalFocus } from '../hooks/useModalFocus';

interface WalkthroughModalProps {
  open: boolean;
  onClose: () => void;
  /** Whether AI autofill applies to this account (Pro) — shows that step. */
  aiEnabled?: boolean;
}

interface Step {
  eyebrow: string;
  title: string;
  body: React.ReactNode;
}

const BASE_STEPS: Step[] = [
  {
    eyebrow: 'Welcome',
    title: 'Chart a dental procedure, top to bottom',
    body: (
      <>
        ToothOps walks a full-mouth dental record in eight numbered sections down
        the left rail. Work through them in order, or jump around — everything
        saves as you go.
      </>
    ),
  },
  {
    eyebrow: 'Section 01–03',
    title: 'Patient, exam & anesthesia',
    body: (
      <>
        Start with the patient and owner details, species and dentition, and the
        recheck date. Record oral-exam findings, then anesthesia and nerve-block
        doses. Only the <strong>patient name</strong> is required to save.
      </>
    ),
  },
  {
    eyebrow: 'Section 04',
    title: 'The charting grid',
    body: (
      <>
        Enter per-tooth measurements — mobility, pockets, recession, and more.
        It behaves like a spreadsheet: <strong>Tab</strong> moves across,{' '}
        <strong>Enter</strong> moves down, so you can chart without looking up.
        Type shorthand codes and pick from the popup.
      </>
    ),
  },
  {
    eyebrow: 'Section 05–06',
    title: 'Diagnosis & procedure diagrams',
    body: (
      <>
        Click a tooth to mark it missing (Diagnosis) or extracted (Procedure).
        Switch between <strong>Comment</strong> and <strong>Draw</strong> tools,
        add free-floating notes, and use the searchable code reference beside the
        diagram. Undo with ⌘Z.
      </>
    ),
  },
  {
    eyebrow: 'Section 07–08',
    title: 'Images and the treatment report',
    body: (
      <>
        Attach intraoral photos and radiographs (they’re downscaled and stored
        privately), then write the treatment report — insert your saved templates
        to move fast. Hit <strong>Preview PDF</strong> anytime to download the
        finished chart.
      </>
    ),
  },
  {
    eyebrow: 'Saving',
    title: 'Autosave & My charts',
    body: (
      <>
        New charts <strong>autosave</strong> once they have a patient name — no
        Save button to remember. Open a past visit from <strong>My charts</strong>;
        it opens read-only so history isn’t changed by accident, with an{' '}
        <strong>Edit</strong> button when you do want to update it. Switch between
        a patient’s visits from the date dropdown up top.
      </>
    ),
  },
];

const AI_STEP: Step = {
  eyebrow: 'Pro',
  title: 'AI voice autofill',
  body: (
    <>
      Press <strong>AI autofill</strong> and dictate as you work — the assistant
      transcribes and fills the chart for you, showing each change so you can
      undo anything that’s off. Everything you say stays reviewable.
    </>
  ),
};

const LAST_STEP: Step = {
  eyebrow: 'Settings',
  title: 'Make it yours',
  body: (
    <>
      Under <strong>Settings</strong> you’ll find your practice name and logo,
      the team, recheck-reminder templates, and your account. You can reopen this
      walkthrough there anytime.
    </>
  ),
};

/**
 * First-run guided tour. A stepped modal that introduces each part of the
 * app; auto-shown once per browser and relaunchable from Settings.
 */
export const WalkthroughModal: React.FC<WalkthroughModalProps> = ({ open, onClose, aiEnabled }) => {
  const steps = React.useMemo(
    () => [...BASE_STEPS, ...(aiEnabled ? [AI_STEP] : []), LAST_STEP],
    [aiEnabled]
  );
  const [i, setI] = React.useState(0);
  const modalRef = useModalFocus(open);

  React.useEffect(() => {
    if (open) setI(0);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, steps.length - 1));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, steps.length]);

  if (!open) return null;
  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <div className="ai-settings-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Getting started">
      <div className="ai-settings-modal walkthrough" ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>Getting started</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="ai-settings-body walkthrough__body">
          <p className="walkthrough__eyebrow">{step.eyebrow}</p>
          <h3 className="walkthrough__title">{step.title}</h3>
          <p className="walkthrough__text">{step.body}</p>
        </div>

        <footer className="ai-settings-footer walkthrough__footer">
          <div className="walkthrough__dots" aria-hidden="true">
            {steps.map((_, n) => (
              <span key={n} className={`walkthrough__dot${n === i ? ' walkthrough__dot--on' : ''}`} />
            ))}
          </div>
          <span className="walkthrough__count" aria-live="polite">{i + 1} of {steps.length}</span>
          <div className="walkthrough__nav">
            {i > 0 && (
              <button type="button" className="diagram-view__action" onClick={() => setI((n) => n - 1)}>
                Back
              </button>
            )}
            <button
              type="button"
              className="entry-grid__button entry-grid__button--topbar"
              onClick={() => (last ? onClose() : setI((n) => n + 1))}
            >
              {last ? 'Get charting' : 'Next'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
