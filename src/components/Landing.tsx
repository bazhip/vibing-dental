import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Login } from './Login';
import { LandingFeatures } from './LandingFeatures';
import { cloudEnabled } from '../utils/supabaseClient';
import { PLANS, PlanKey, CONTACT_EMAIL, TRIAL_DAYS, PRICING_PUBLIC, PAID_SIGNUP, formatPlanPrice } from '../constants/plans';
import { LanguageSwitcher } from '../i18n/LanguageSwitcher';
import {
  DEMO_TEETH_PATHS,
  DEMO_TEETH_VIEWBOX,
  DEMO_CANINE_BBOX,
  DEMO_MISSING_PATH,
} from './landingTeeth';
import { EnglishGoverns } from './LegalNotice';
import './Landing.css';

// Demo data, not UI text: the sample patient, its chart rows (AVDC / Triadan codes)
// and the sample file name stay as they are in every language.
const DEMO_PATIENT = 'Biscuit';
const DEMO_DATE = '2026-07-17';
const DEMO_PDF = `chart_biscuit_${DEMO_DATE}.pdf`;
const DEMO_COMMENT_LABEL = 'C (104)';
const DEMO_HEAD_STAGE = 'PD';
const DEMO_ROWS = [
  { tooth: '104', cells: ['M2', '6', 'G2', 'PD3'], classes: ['1', '2', '3', '4'] },
  { tooth: '103', cells: ['—', '—', '—', '—'], missing: true },
  { tooth: '108', cells: ['F2', '4', 'G1', 'PD1'], classes: ['5', '6', '7', '8'] },
];

interface LandingProps {
  onAuthenticate: () => void;
  /** Start the no-account trial (chart locally, PDFs stamped TRIAL). */
  onTryFree?: () => void;
  /** Open the auth overlay immediately (e.g. returning from the trial's
   *  "Create free account" CTA). */
  initialAuth?: 'signin' | 'signup' | null;
  /** Set when the viewer already has the app open (signed in or trial)
   *  and is just visiting the homepage — CTAs become "Back to the app". */
  onOpenApp?: () => void;
  /** Show the device language picker (default). Off when signed in: the
   *  language is then an account setting, chosen in the Account dialog. */
  languagePicker?: boolean;
}

/**
 * Public homepage. The hero's centerpiece is a miniature chart that
 * charts itself — grid values typing in, a tooth flipping to missing, a
 * comment card arriving — built from the product's own visual language
 * (same tokens, same components' look) so the preview never drifts from
 * the real app. CTAs open the sign-in / signup panel in an overlay.
 *
 * All motion is pure CSS keyframes and honors prefers-reduced-motion via
 * the app's global override.
 */
export const Landing: React.FC<LandingProps> = ({
  onAuthenticate,
  onTryFree,
  initialAuth = null,
  onOpenApp,
  languagePicker = true,
}) => {
  const { t } = useTranslation('landing');
  const [auth, setAuth] = React.useState<'signin' | 'signup' | null>(initialAuth);
  // Set when a pricing card's CTA opened the signup — preselects the plan.
  const [signupPlan, setSignupPlan] = React.useState<PlanKey | undefined>(undefined);
  // WCAG 2.2.2 — the hero demo loops indefinitely, so it needs an
  // on-page pause (prefers-reduced-motion alone only covers users who
  // set the OS switch).
  const [demoPaused, setDemoPaused] = React.useState(false);
  // Full-size lightbox for the sample chart pages.
  const [zoomedChart, setZoomedChart] = React.useState<{ src: string; alt: string } | null>(null);
  const lightboxCloseRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!zoomedChart) return;
    lightboxCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomedChart(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomedChart]);
  const inApp = !!onOpenApp;

  const openSignup = (plan?: PlanKey) => {
    setSignupPlan(plan);
    setAuth('signup');
  };

  const scrollToPricing = () =>
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  React.useEffect(() => {
    if (!auth) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAuth(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [auth]);

  return (
    <div className="landing">
      <header className="landing__topbar">
        <span className="landing__wordmark">
          <span className="landing__wordmark-tooth" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M7.2 3.5c-2.6 0-4.4 2.1-4.4 4.9 0 4.6 2.2 12.1 4 12.1 1.6 0 1.4-3.4 2.4-6.2.5-1.4 1.1-2 1.8-2s1.3.6 1.8 2c1 2.8.8 6.2 2.4 6.2 1.8 0 4-7.5 4-12.1 0-2.8-1.8-4.9-4.4-4.9-1.7 0-2.4.9-3.8.9s-2.1-.9-3.8-.9z"
                fill="currentColor"
              />
            </svg>
          </span>
          {t('wordmark')}
        </span>
        <nav className="landing__nav">
          {languagePicker && <LanguageSwitcher compact />}
          {cloudEnabled && PRICING_PUBLIC && (
            <button type="button" className="landing__nav-signin" onClick={scrollToPricing}>
              {t('nav.pricing')}
            </button>
          )}
          {inApp ? (
            <button type="button" className="landing__nav-cta" onClick={onOpenApp}>
              {t('nav.backToApp')}
            </button>
          ) : (
            <>
              <button type="button" className="landing__nav-signin" onClick={() => setAuth('signin')}>
                {t('nav.signIn')}
              </button>
              {cloudEnabled && (
                <button type="button" className="landing__nav-cta" onClick={() => openSignup()}>
                  {t('nav.getStarted')}
                </button>
              )}
            </>
          )}
        </nav>
      </header>

      <main>
        {/* ------------------------------------------------------- hero --- */}
        <section className="landing__hero">
          <div className="landing__hero-copy">
            <p className="landing__eyebrow">
              {t('hero.eyebrow')}
              {!PAID_SIGNUP && <span className="landing__beta-pill">{t('hero.betaPill')}</span>}
            </p>
            <h1 className="landing__headline">
              {t('hero.headlineLine1')}
              <br />
              {t('hero.headlineLine2')}
            </h1>
            <p className="landing__sub">
              {t('hero.sub')}
            </p>
            <div className="landing__cta-row">
              {inApp ? (
                <button type="button" className="landing__cta" onClick={onOpenApp}>
                  {t('nav.backToApp')}
                </button>
              ) : cloudEnabled ? (
                <>
                  <button type="button" className="landing__cta" onClick={() => openSignup()}>
                    {PAID_SIGNUP ? t('hero.ctaTrial', { days: TRIAL_DAYS }) : t('hero.ctaFree')}
                  </button>
                  {onTryFree && (
                    <button type="button" className="landing__cta-ghost" onClick={onTryFree}>
                      {t('hero.tryFree')}
                    </button>
                  )}
                  <span className="landing__cta-note">
                    {PAID_SIGNUP
                      ? (PRICING_PUBLIC
                          ? t('hero.notePricing', { price: formatPlanPrice(20), days: TRIAL_DAYS })
                          : t('hero.noteTrial', { days: TRIAL_DAYS }))
                      : t('hero.noteBeta')}
                    {onTryFree ? ` · ${t('hero.noteNoAccount')}` : ''}
                  </span>
                </>
              ) : (
                <button type="button" className="landing__cta" onClick={() => setAuth('signin')}>
                  {t('hero.openApp')}
                </button>
              )}
            </div>
          </div>

          {/* Self-charting product mock — three CSS-animated scenes that
              loop: grid charting → the real diagram artwork → export. */}
          <div
            className={`landing__hero-demo${demoPaused ? ' landing__hero-demo--paused' : ''}`}
            aria-hidden="true"
          >
            <div className="demo-window">
              <div className="demo-window__bar">
                <span className="demo-window__patient">{DEMO_PATIENT}</span>
                <span className="demo-window__meta">{t('demo.meta', { date: DEMO_DATE })}</span>
                <span className="demo-window__steps">
                  <span className="demo-step demo-step--a">{t('demo.stepChart')}</span>
                  <span className="demo-step demo-step--b">{t('demo.stepDiagram')}</span>
                  <span className="demo-step demo-step--c">{t('demo.stepExport')}</span>
                </span>
              </div>

              <div className="demo-stage">
                {/* Scene A — the charting grid fills itself in. */}
                <div className="demo-scene demo-scene--a">
                  <div className="demo-grid">
                    <div className="demo-grid__row demo-grid__row--head">
                      <span>{t('demo.colTooth')}</span>
                      <span>{t('demo.colMobility')}</span>
                      <span>{t('demo.colPocket')}</span>
                      <span>{t('demo.colGingivitis')}</span>
                      <span>{DEMO_HEAD_STAGE}</span>
                    </div>
                    {DEMO_ROWS.map((row) => (
                      <div key={row.tooth} className={row.missing ? 'demo-grid__row demo-grid__row--missing' : 'demo-grid__row'}>
                        <span className="demo-grid__tooth">{row.tooth}</span>
                        {row.cells.map((cell, i) => (
                          <span key={i} className={row.classes ? `demo-cell demo-cell--${row.classes[i]}` : 'demo-cell'}>
                            {cell}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="demo-caption">{t('demo.captionChart')}</div>
                </div>

                {/* Scene B — the app's actual diagram artwork (maxillary
                    incisor + canine block from feline.svg) with the real
                    extracted mark: a red X drawn over tooth 104. */}
                <div className="demo-scene demo-scene--b">
                  <div className="demo-artwork">
                    <svg viewBox={DEMO_TEETH_VIEWBOX} className="demo-artwork__svg">
                      {/* One combined path with evenodd, exactly like the
                          app's diagram — inner contours become hollows. */}
                      <path
                        d={DEMO_TEETH_PATHS.join(' ')}
                        className="demo-artwork__tooth"
                        fillRule="evenodd"
                      />
                      {/* Incisor 103 fills solid — the app's "missing"
                          mark, matching the crossed-out 103 grid row. */}
                      <path d={DEMO_MISSING_PATH} className="demo-missing-fill" />
                      <g className="demo-x">
                        <line
                          x1={DEMO_CANINE_BBOX.minX + 2}
                          y1={DEMO_CANINE_BBOX.minY + 6}
                          x2={DEMO_CANINE_BBOX.maxX - 2}
                          y2={DEMO_CANINE_BBOX.maxY - 6}
                          className="demo-x__stroke demo-x__stroke--1"
                        />
                        <line
                          x1={DEMO_CANINE_BBOX.maxX - 2}
                          y1={DEMO_CANINE_BBOX.minY + 6}
                          x2={DEMO_CANINE_BBOX.minX + 2}
                          y2={DEMO_CANINE_BBOX.maxY - 6}
                          className="demo-x__stroke demo-x__stroke--2"
                        />
                      </g>
                    </svg>
                    <div className="demo-comment">
                      <strong>{DEMO_COMMENT_LABEL}</strong>
                      <span>{t('demo.comment')}</span>
                    </div>
                  </div>
                  <div className="demo-caption">{t('demo.captionDiagram')}</div>
                </div>

                {/* Scene C — voice in, branded PDF out. */}
                <div className="demo-scene demo-scene--c">
                  <div className="demo-voice">
                    <span className="demo-voice__mic">●</span>
                    {t('demo.voice')}
                  </div>
                  <div className="demo-doc">
                    <div className="demo-doc__logo" />
                    <div className="demo-doc__line demo-doc__line--wide" />
                    <div className="demo-doc__line" />
                    <div className="demo-doc__grid" />
                  </div>
                  <div className="demo-pdf">
                    <span className="demo-pdf__icon">⤓</span> {DEMO_PDF}
                  </div>
                  <div className="demo-caption">{t('demo.captionExport')}</div>
                </div>
              </div>
            </div>
          </div>
          {/* Outside the aria-hidden demo so assistive tech can reach it. */}
          <button
            type="button"
            className="landing__demo-pause"
            onClick={() => setDemoPaused((p) => !p)}
            aria-pressed={demoPaused}
          >
            {demoPaused ? t('demo.play') : t('demo.pause')}
          </button>
        </section>

        {/* --------------------------------------------------- features --- */}
        {/* Clickable cards — each opens a detail dialog with a real product
            screenshot and the feature's full story (LandingFeatures owns
            the data, so this list can't drift from the app again). */}
        <LandingFeatures />

        {/* ---------------------------------------------------- pricing --- */}
        {cloudEnabled && PRICING_PUBLIC && (
          <section className="landing__pricing" id="pricing">
            <h2>{t('pricing.title')}</h2>
            <p className="landing__pricing-sub">
              {t('pricing.sub', { days: TRIAL_DAYS })}
            </p>
            <div className="landing__pricing-grid">
              {PLANS.map((p) => (
                <div key={p.key} className={p.key === 'practice_basic' ? 'pricing-card pricing-card--featured' : 'pricing-card'}>
                  {p.key === 'practice_basic' && <span className="pricing-card__flag">{t('pricing.mostPopular')}</span>}
                  <h3>{p.name}</h3>
                  <p className="pricing-card__price">
                    {formatPlanPrice(p.priceMonthly)}
                    <span>{t('pricing.perMonth')}</span>
                  </p>
                  <p className="pricing-card__tagline">{p.tagline}</p>
                  <ul>
                    {p.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  {!inApp && (
                    <button type="button" className="pricing-card__cta" onClick={() => openSignup(p.key)}>
                      {t('pricing.startTrial')}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="landing__pricing-contact">
              <Trans
                t={t}
                i18nKey="pricing.contact"
                components={{
                  // The subject line is for us to read, so it stays English.
                  a: <a href={`mailto:${CONTACT_EMAIL}?subject=ToothOps%20pricing%20for%20a%20larger%20team`} />,
                }}
              />
            </p>
          </section>
        )}

        {/* -------------------------------------------------- pdf preview --- */}
        <section className="landing__paper">
          <div className="landing__paper-copy">
            <h2>{t('paper.title')}</h2>
            <p>{t('paper.body')}</p>
            <ul className="landing__paper-points">
              <li>{t('paper.point1')}</li>
              <li>{t('paper.point2')}</li>
              <li>{t('paper.point3')}</li>
            </ul>
            {/* Page 2 sits under the copy so the section's two columns
                fill evenly — page 1 alone runs taller than the text. */}
            <button
              type="button"
              className="landing__paper-zoom"
              onClick={() =>
                setZoomedChart({
                  src: '/landing-chart-p2.png',
                  alt: t('paper.page2Zoom'),
                })
              }
              aria-label={t('paper.page2Label')}
            >
              <img
                className="landing__paper-p2"
                src="/landing-chart-p2.png"
                alt={t('paper.page2Alt')}
                loading="lazy"
              />
            </button>
          </div>
          <div className="landing__paper-shot">
            <button
              type="button"
              className="landing__paper-zoom"
              onClick={() =>
                setZoomedChart({
                  src: '/landing-chart.png',
                  alt: t('paper.page1Zoom'),
                })
              }
              aria-label={t('paper.page1Label')}
            >
              <img
                src="/landing-chart.png"
                alt={t('paper.page1Alt')}
                loading="lazy"
              />
            </button>
          </div>
        </section>

        {/* ------------------------------------------------- final CTA --- */}
        <section className="landing__closer">
          <h2>{t('closer.title')}</h2>
          {inApp ? (
            <button type="button" className="landing__cta" onClick={onOpenApp}>
              {t('nav.backToApp')}
            </button>
          ) : cloudEnabled ? (
            <button type="button" className="landing__cta" onClick={() => openSignup()}>
              {PAID_SIGNUP ? t('hero.ctaTrial', { days: TRIAL_DAYS }) : t('hero.ctaFree')}
            </button>
          ) : (
            <button type="button" className="landing__cta" onClick={() => setAuth('signin')}>
              {t('hero.openApp')}
            </button>
          )}
          {!inApp && cloudEnabled && onTryFree && (
            <button type="button" className="landing__cta-ghost" onClick={onTryFree}>
              {t('hero.tryFree')}
            </button>
          )}
        </section>
      </main>

      <footer className="landing__footer">
        <span>{t('footer.tagline')}</span>
        <span className="landing__footer-links">
          <a href="/privacy">{t('footer.privacy')}</a>
          <a href="/terms">{t('footer.terms')}</a>
          <a href="/dpa">{t('footer.dpa')}</a>
          <a href="mailto:bazhip@gmail.com">{t('footer.contact')}</a>
        </span>
        <EnglishGoverns className="landing__footer-note" />
      </footer>

      {auth && (
        <div
          className="landing__auth-overlay"
          onClick={() => setAuth(null)}
          role="dialog"
          aria-modal="true"
          aria-label={auth === 'signup' ? t('login.subtitle.signup', { ns: 'auth' }) : t('login.signIn', { ns: 'auth' })}
        >
          <div className="landing__auth-panel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="landing__auth-close" onClick={() => setAuth(null)} aria-label={t('actions.close', { ns: 'common' })}>
              ×
            </button>
            <Login onAuthenticate={onAuthenticate} initialMode={auth} embedded initialPlan={signupPlan} />
          </div>
        </div>
      )}

      {zoomedChart && (
        <div
          className="landing__lightbox"
          onClick={() => setZoomedChart(null)}
          role="dialog"
          aria-modal="true"
          aria-label={zoomedChart.alt}
        >
          <button
            ref={lightboxCloseRef}
            type="button"
            className="landing__lightbox-close"
            onClick={() => setZoomedChart(null)}
            aria-label={t('lightboxClose')}
          >
            ×
          </button>
          <img src={zoomedChart.src} alt={zoomedChart.alt} />
        </div>
      )}
    </div>
  );
};
