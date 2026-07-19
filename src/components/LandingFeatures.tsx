import React from 'react';
import { useModalFocus } from '../hooks/useModalFocus';

/**
 * The landing page's feature grid. Every card opens a detail dialog with
 * a real product screenshot (captured from the live app), the full story
 * of the feature, and prev/next paging so a curious visitor can flip
 * through the whole product without closing the dialog.
 */

interface LandingFeature {
  id: string;
  /** Card + dialog title. */
  title: string;
  /** Card blurb (short). */
  blurb: string;
  /** Badge rendered on the card and dialog ('AI · Pro', 'Beta'). */
  tag?: string;
  /** Dialog lead paragraph. */
  lead: string;
  /** Dialog bullet points — the full feature story. */
  points: string[];
  /** Screenshot under /screenshots (omit for the animated voice mock). */
  image?: string;
  imageAlt?: string;
  /** Render the CSS-animated voice mock instead of a screenshot. */
  voiceMock?: boolean;
}

const FEATURES: LandingFeature[] = [
  {
    id: 'grid',
    title: 'Charts like a spreadsheet',
    blurb:
      'Full-mouth Triadan grids for feline, canine, and deciduous dentition. One click to type, Tab/Enter/Space to fly through a called-out run of numbers.',
    lead:
      'The charting grid works the way your team already types: click any cell and go. Probing depths in, eyes on the patient.',
    points: [
      'Single click puts a cell straight into edit — no double-click dance.',
      'Tab, Enter, and Space advance exactly like a spreadsheet, so a called-out run ("3, 2, 4…") lands without looking.',
      'Whole-mouth scores in one action: set calculus or gingivitis for every tooth from the column header.',
      'The Missing checkbox crosses out the row and fills the tooth on the diagram — one source of truth.',
      'On a return visit, last time’s values appear as faint hints in empty cells: compare without opening the old chart.',
      'Feline, canine, puppy, and kitten dentitions, all Triadan-numbered.',
    ],
    image: '/screenshots/feat-grid.jpg',
    imageAlt:
      'The charting grid with probing depths, furcation and mobility grades entered, and tooth 103 crossed out as missing',
  },
  {
    id: 'voice',
    title: 'AI voice autofill, built in',
    tag: 'AI · Pro',
    blurb:
      'Say “104 complicated crown fracture” and it lands on the tooth — transcribed and charted while your hands stay on the patient.',
    lead:
      'Dictate as you work: a medical-grade speech model transcribes, and AI routes each finding onto the right tooth, diagram, and field.',
    points: [
      'Medical-vocabulary speech recognition tuned with veterinary dental terms.',
      'Findings land as structured chart entries — grid values, tooth marks, anchored comments — not a wall of text.',
      'A live transcript sidebar shows every action as it happens; each one highlights the tooth it touched.',
      'Everything the AI writes goes through the same undo system as your own edits.',
      'No API keys and no setup — it’s part of Pro.',
    ],
    voiceMock: true,
  },
  {
    id: 'diagrams',
    title: 'Diagrams that stay in sync',
    blurb:
      'Diagnosis and procedure tooth diagrams follow the grid — cross a tooth out once and the whole record follows, chart to PDF.',
    lead:
      'Two anatomically-drawn diagrams — findings before, procedures after — that never disagree with the grid or the printed chart.',
    points: [
      'Mark teeth missing or extracted with a click (or the keyboard — every tooth is focusable).',
      'Comments anchor to a tooth and stay pointed at it; free comments go anywhere.',
      'Freehand drawing in five colors for anything a code can’t say.',
      'Zoom and pan for crowded feline mouths.',
      'Teeth marked missing on Diagnosis lock on the Procedure diagram — you can’t re-extract what’s gone.',
      'Each diagram has its own undo stack (⌘Z follows whichever you touched last).',
    ],
    image: '/screenshots/feat-diagram.jpg',
    imageAlt:
      'The Diagnosis diagram with missing teeth filled in and a comment anchored to premolar 105 reading “CCF — extract”',
  },
  {
    id: 'avdc',
    title: 'Speaks AVDC',
    blurb:
      'The complete AVDC abbreviation set throughout, with a searchable reference beside the diagrams and a legend printed on every chart.',
    lead:
      'The record reads cleanly in any hands: standard nomenclature end to end, and the reference is always one glance away.',
    points: [
      'Complete AVDC abbreviation set for pathology and procedures.',
      'A searchable code reference sits beside each diagram — no separate tab, and it stays browsable even on locked charts.',
      'Every code used on the chart prints with its meaning in a legend on the PDF.',
      'Dental-code autocomplete in comment fields as you type.',
    ],
    image: '/screenshots/feat-codes.jpg',
    imageAlt: 'The searchable AVDC code reference panel',
  },
  {
    id: 'pdf',
    title: 'Client-ready PDFs',
    blurb:
      'A branded two-page chart the moment you finish — and the PDF itself can be re-imported later to restore the whole chart.',
    lead:
      'One tap turns the chart into a polished document with your practice name, doctor line, and logo on it.',
    points: [
      'Two pages: diagrams, oral exam, full arch tables, treatment report, and the codes legend.',
      'Multiple document styles — pick per download, preview re-renders live.',
      'The chart’s full state is embedded in the PDF: re-import it later and keep working, even on another machine.',
      'Owner report (beta): a separate plain-English take-home version with before & after photos — auto-generated, editable before printing.',
    ],
    image: '/screenshots/feat-pdf.jpg',
    imageAlt: 'The generated canine dental chart PDF with diagrams, exam findings, and arch tables',
  },
  {
    id: 'photos',
    title: 'Photos & radiographs',
    blurb:
      'Attach intraoral photos and dental rads to any chart, caption them, and pin each to a tooth — stored privately alongside the record.',
    lead:
      'The pictures live where you’ll look for them: on the chart, pinned to the tooth they show.',
    points: [
      'Intraoral photos and radiographs, captioned and pinned per tooth.',
      'Private storage with short-lived signed links — images are never public.',
      'Phone photos are downscaled automatically so charts stay fast.',
      'Tag photos Before/After to drop them into the owner report (beta).',
    ],
  },
  {
    id: 'history',
    title: 'Every visit, one patient',
    blurb:
      'Charts group by patient, so a returning animal’s whole history is one click away — and this visit starts where the last one ended.',
    lead:
      'A patient is a story, not a pile of files. ToothOps keeps the visits together and carries the right things forward.',
    points: [
      'Charts group by patient; a visit switcher in the topbar flips between dates.',
      'New visits carry extracted and missing teeth forward automatically — marked “prev” so they read as history, not today’s finding.',
      'Last visit’s measurements show as hints while you probe, so trends jump out chairside.',
      'Every save is logged — who, when — in each chart’s history.',
      'Saved charts open read-only until deliberately unlocked, so records don’t change by accident.',
    ],
  },
  {
    id: 'recall',
    title: 'Recall built in',
    blurb:
      'Set a recheck date as you chart; the patient list flags who’s due and who’s overdue, so the next dental never slips.',
    lead:
      'Recheck compliance is where dental outcomes are won — the list keeps score for you.',
    points: [
      'A recheck date on the chart puts the patient on the Due list, flagged due or overdue.',
      'Send the owner a reminder email straight from the patient list.',
      'Recheck happened without a new chart? Clear it in one click and the patient drops off the list.',
      'Filter the library to due patients to plan the week’s callbacks.',
    ],
  },
  {
    id: 'team',
    title: 'Your whole team, one record',
    blurb:
      'Add colleagues to your practice and everyone shares the same charts, templates, and images — per-person accounts, not a shared password.',
    lead:
      'The practice is the unit: one shared record set, individual logins, and the doctor on each visit recorded.',
    points: [
      'Practice plans include five seats; every member gets their own login.',
      'Charts, report templates, images, and the practice logo are shared automatically.',
      'Each visit records its author — filter the library by doctor.',
      'Owner-only controls for renaming the practice and managing the team.',
    ],
  },
  {
    id: 'offline',
    title: 'Cloud & chairside',
    blurb:
      'Every chart autosaves to the cloud and keeps a local copy chairside, so a dropped connection never loses a mouth.',
    lead:
      'Clinic Wi-Fi is not part of your anesthesia protocol. ToothOps assumes the connection will drop and plans around it.',
    points: [
      'Every keystroke persists locally, instantly — a reload mid-procedure loses nothing.',
      'New charts autosave to the cloud; failed saves retry automatically when the connection returns.',
      'If your session expires mid-procedure, the chart stays open — sign back in right on top of it.',
      'Reusable report templates save the typing on every COHAT.',
    ],
  },
];

export const LandingFeatures: React.FC = () => {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);
  const modalRef = useModalFocus(openIndex !== null);
  const feature = openIndex === null ? null : FEATURES[openIndex];

  React.useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIndex(null);
      if (e.key === 'ArrowRight') setOpenIndex((i) => (i === null ? i : (i + 1) % FEATURES.length));
      if (e.key === 'ArrowLeft') setOpenIndex((i) => (i === null ? i : (i - 1 + FEATURES.length) % FEATURES.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openIndex]);

  return (
    <>
      <section className="landing__features">
        {FEATURES.map((f, i) => (
          <button
            key={f.id}
            type="button"
            className={`landing__feature${f.voiceMock ? ' landing__feature--ai' : ''}`}
            onClick={() => setOpenIndex(i)}
            aria-haspopup="dialog"
          >
            <h3>{f.title}</h3>
            <p>{f.blurb}</p>
            <span className="landing__feature-more" aria-hidden="true">
              See it →
            </span>
          </button>
        ))}
      </section>

      {feature && (
        <div
          className="feature-modal__overlay"
          onClick={() => setOpenIndex(null)}
          role="dialog"
          aria-modal="true"
          aria-label={feature.title}
        >
          <div
            className="feature-modal"
            ref={modalRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="feature-modal__header">
              <h3>
                {feature.title}
                {feature.tag && <span className="feature-modal__tag">{feature.tag}</span>}
              </h3>
              <button
                type="button"
                className="pdf-preview-close"
                onClick={() => setOpenIndex(null)}
                aria-label="Close"
              >
                ×
              </button>
            </header>

            {feature.image && (
              <div className="feature-modal__shot-wrap">
                <img
                  key={feature.id}
                  src={feature.image}
                  alt={feature.imageAlt ?? ''}
                  className="feature-modal__shot"
                  loading="lazy"
                />
              </div>
            )}
            {feature.voiceMock && (
              <div className="feature-modal__voice" aria-hidden="true">
                <div className="feature-modal__voice-line">
                  <span className="feature-modal__mic">●</span>
                  “one-oh-four complicated crown fracture, pulp exposed…”
                </div>
                <div className="feature-modal__voice-result feature-modal__voice-result--1">
                  104 · comment “CCF, pulp exposure”
                </div>
                <div className="feature-modal__voice-result feature-modal__voice-result--2">
                  104 · PD State → PD3
                </div>
                <div className="feature-modal__voice-result feature-modal__voice-result--3">
                  Procedure diagram · 104 marked for extraction
                </div>
              </div>
            )}

            <p className="feature-modal__lead">{feature.lead}</p>
            <ul className="feature-modal__points">
              {feature.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>

            <footer className="feature-modal__nav">
              <button
                type="button"
                className="feature-modal__nav-btn"
                onClick={() => setOpenIndex((i) => (i === null ? i : (i - 1 + FEATURES.length) % FEATURES.length))}
              >
                ← Previous
              </button>
              <span className="feature-modal__nav-count">
                {(openIndex ?? 0) + 1} / {FEATURES.length}
              </span>
              <button
                type="button"
                className="feature-modal__nav-btn"
                onClick={() => setOpenIndex((i) => (i === null ? i : (i + 1) % FEATURES.length))}
              >
                Next →
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
};
