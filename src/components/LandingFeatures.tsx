import React from 'react';
import { useTranslation } from 'react-i18next';
import { useModalFocus } from '../hooks/useModalFocus';

/**
 * The landing page's feature grid. Every card opens a detail dialog with
 * a real product screenshot (captured from the live app), the full story
 * of the feature, and prev/next paging so a curious visitor can flip
 * through the whole product without closing the dialog.
 */

type FeatureId = 'grid' | 'voice' | 'diagrams' | 'avdc' | 'pdf' | 'photos' | 'history' | 'recall' | 'team' | 'offline';

interface LandingFeature {
  id: FeatureId;
  /** How many `features.<id>.points.p<n>` lines the dialog lists. */
  points: number;
  /** The card and dialog show a badge (features.<id>.tag). */
  tag?: boolean;
  /** Screenshot under /screenshots (omit for the animated voice mock); its alt text is features.<id>.imageAlt. */
  image?: string;
  /** Render the CSS-animated voice mock instead of a screenshot. */
  voiceMock?: boolean;
}

/** Text lives in landing.json under features.<id>.{title,blurb,lead,tag,imageAlt,points.p<n>}. */
const FEATURES: LandingFeature[] = [
  { id: 'grid', points: 6, image: '/screenshots/feat-grid.jpg' },
  { id: 'voice', points: 6, tag: true, voiceMock: true },
  { id: 'diagrams', points: 6, image: '/screenshots/feat-diagram.jpg' },
  { id: 'avdc', points: 4, image: '/screenshots/feat-codes.jpg' },
  { id: 'pdf', points: 4, image: '/screenshots/feat-pdf.jpg' },
  { id: 'photos', points: 4 },
  { id: 'history', points: 5 },
  { id: 'recall', points: 4 },
  { id: 'team', points: 4 },
  { id: 'offline', points: 4 },
];

export const LandingFeatures: React.FC = () => {
  const { t } = useTranslation('landing');
  // Keys are built from the feature id and point number, so the typed `t` cannot
  // check them; the pseudo-locale test and i18n:check cover every one.
  const text = (key: string): string => (t as unknown as (k: string) => string)(key);
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
            <h3>{text(`features.${f.id}.title`)}</h3>
            <p>{text(`features.${f.id}.blurb`)}</p>
            <span className="landing__feature-more" aria-hidden="true">
              {t('features.seeIt')}
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
          aria-label={text(`features.${feature.id}.title`)}
        >
          <div
            className="feature-modal"
            ref={modalRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="feature-modal__header">
              <h3>
                {text(`features.${feature.id}.title`)}
                {feature.tag && <span className="feature-modal__tag">{text(`features.${feature.id}.tag`)}</span>}
              </h3>
              <button
                type="button"
                className="pdf-preview-close"
                onClick={() => setOpenIndex(null)}
                aria-label={t('actions.close', { ns: 'common' })}
              >
                ×
              </button>
            </header>

            {feature.image && (
              <div className="feature-modal__shot-wrap">
                <img
                  key={feature.id}
                  src={feature.image}
                  alt={text(`features.${feature.id}.imageAlt`)}
                  className="feature-modal__shot"
                  loading="lazy"
                />
              </div>
            )}
            {feature.voiceMock && (
              <div className="feature-modal__voice" aria-hidden="true">
                <div className="feature-modal__voice-line">
                  <span className="feature-modal__mic">●</span>
                  {t('demo.voice')}
                </div>
                <div className="feature-modal__voice-result feature-modal__voice-result--1">
                  {t('features.voiceResult1')}
                </div>
                <div className="feature-modal__voice-result feature-modal__voice-result--2">
                  {t('features.voiceResult2')}
                </div>
                <div className="feature-modal__voice-result feature-modal__voice-result--3">
                  {t('features.voiceResult3')}
                </div>
              </div>
            )}

            <p className="feature-modal__lead">{text(`features.${feature.id}.lead`)}</p>
            <ul className="feature-modal__points">
              {Array.from({ length: feature.points }, (_, i) => (
                <li key={i}>{text(`features.${feature.id}.points.p${i + 1}`)}</li>
              ))}
            </ul>

            <footer className="feature-modal__nav">
              <button
                type="button"
                className="feature-modal__nav-btn"
                onClick={() => setOpenIndex((i) => (i === null ? i : (i - 1 + FEATURES.length) % FEATURES.length))}
              >
                {t('features.previous')}
              </button>
              <span className="feature-modal__nav-count">
                {(openIndex ?? 0) + 1} / {FEATURES.length}
              </span>
              <button
                type="button"
                className="feature-modal__nav-btn"
                onClick={() => setOpenIndex((i) => (i === null ? i : (i + 1) % FEATURES.length))}
              >
                {t('features.next')}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
};
