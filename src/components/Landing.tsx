import React from 'react';
import { Login } from './Login';
import { LandingFeatures } from './LandingFeatures';
import { cloudEnabled } from '../utils/supabaseClient';
import { PLANS, PlanKey, CONTACT_EMAIL, TRIAL_DAYS, PRICING_PUBLIC, PAID_SIGNUP } from '../constants/plans';
import {
  DEMO_TEETH_PATHS,
  DEMO_TEETH_VIEWBOX,
  DEMO_CANINE_BBOX,
  DEMO_MISSING_PATH,
} from './landingTeeth';
import './Landing.css';

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
}) => {
  const [auth, setAuth] = React.useState<'signin' | 'signup' | null>(initialAuth);
  // Set when a pricing card's CTA opened the signup — preselects the plan.
  const [signupPlan, setSignupPlan] = React.useState<PlanKey | undefined>(undefined);
  // WCAG 2.2.2 — the hero demo loops indefinitely, so it needs an
  // on-page pause (prefers-reduced-motion alone only covers users who
  // set the OS switch).
  const [demoPaused, setDemoPaused] = React.useState(false);
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
          ToothOps Charting
        </span>
        <nav className="landing__nav">
          {cloudEnabled && PRICING_PUBLIC && (
            <button type="button" className="landing__nav-signin" onClick={scrollToPricing}>
              Pricing
            </button>
          )}
          {inApp ? (
            <button type="button" className="landing__nav-cta" onClick={onOpenApp}>
              Back to the app
            </button>
          ) : (
            <>
              <button type="button" className="landing__nav-signin" onClick={() => setAuth('signin')}>
                Sign in
              </button>
              {cloudEnabled && (
                <button type="button" className="landing__nav-cta" onClick={() => openSignup()}>
                  Get started
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
            <p className="landing__eyebrow">AI-native veterinary dental charting</p>
            <h1 className="landing__headline">
              Just talk.
              <br />
              The chart fills itself.
            </h1>
            <p className="landing__sub">
              Dictate as you work and AI writes the findings straight onto a
              full-mouth Triadan chart — AVDC nomenclature, per-tooth
              measurements, and the diagrams. Plus photos and radiographs,
              per-patient visit history, recheck reminders, and a client-ready
              PDF with your logo the moment you finish.
            </p>
            <div className="landing__cta-row">
              {inApp ? (
                <button type="button" className="landing__cta" onClick={onOpenApp}>
                  Back to the app
                </button>
              ) : cloudEnabled ? (
                <>
                  <button type="button" className="landing__cta" onClick={() => openSignup()}>
                    {PAID_SIGNUP ? `Start your ${TRIAL_DAYS}-day free trial` : 'Create your free account'}
                  </button>
                  {onTryFree && (
                    <button type="button" className="landing__cta-ghost" onClick={onTryFree}>
                      Try it free — no account
                    </button>
                  )}
                  <span className="landing__cta-note">
                    {PAID_SIGNUP
                      ? (PRICING_PUBLIC ? `Plans from $20/mo · ${TRIAL_DAYS}-day free trial · cancel anytime` : `${TRIAL_DAYS}-day free trial · cancel anytime`)
                      : 'Free plan · no card required'}
                    {onTryFree ? ' · no-account trial PDFs are stamped TRIAL' : ''}
                  </span>
                </>
              ) : (
                <button type="button" className="landing__cta" onClick={() => setAuth('signin')}>
                  Open the charting app
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
                <span className="demo-window__patient">Biscuit</span>
                <span className="demo-window__meta">Feline · 2026-07-17</span>
                <span className="demo-window__steps">
                  <span className="demo-step demo-step--a">Chart</span>
                  <span className="demo-step demo-step--b">Diagram</span>
                  <span className="demo-step demo-step--c">Export</span>
                </span>
              </div>

              <div className="demo-stage">
                {/* Scene A — the charting grid fills itself in. */}
                <div className="demo-scene demo-scene--a">
                  <div className="demo-grid">
                    <div className="demo-grid__row demo-grid__row--head">
                      <span>Tooth</span><span>Mob</span><span>Poc</span><span>Gin</span><span>PD</span>
                    </div>
                    <div className="demo-grid__row">
                      <span className="demo-grid__tooth">104</span>
                      <span className="demo-cell demo-cell--1">M2</span>
                      <span className="demo-cell demo-cell--2">6</span>
                      <span className="demo-cell demo-cell--3">G2</span>
                      <span className="demo-cell demo-cell--4">PD3</span>
                    </div>
                    <div className="demo-grid__row demo-grid__row--missing">
                      <span className="demo-grid__tooth">103</span>
                      <span className="demo-cell">—</span>
                      <span className="demo-cell">—</span>
                      <span className="demo-cell">—</span>
                      <span className="demo-cell">—</span>
                    </div>
                    <div className="demo-grid__row">
                      <span className="demo-grid__tooth">108</span>
                      <span className="demo-cell demo-cell--5">F2</span>
                      <span className="demo-cell demo-cell--6">4</span>
                      <span className="demo-cell demo-cell--7">G1</span>
                      <span className="demo-cell demo-cell--8">PD1</span>
                    </div>
                  </div>
                  <div className="demo-caption">Tab · Enter — charts like a spreadsheet</div>
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
                      <strong>C (104)</strong>
                      <span>T/FX/CC — pulp exposed</span>
                    </div>
                  </div>
                  <div className="demo-caption">Mark it once — grid, diagram &amp; PDF stay in sync</div>
                </div>

                {/* Scene C — voice in, branded PDF out. */}
                <div className="demo-scene demo-scene--c">
                  <div className="demo-voice">
                    <span className="demo-voice__mic">●</span>
                    “one-oh-four complicated crown fracture, pulp exposed…”
                  </div>
                  <div className="demo-doc">
                    <div className="demo-doc__logo" />
                    <div className="demo-doc__line demo-doc__line--wide" />
                    <div className="demo-doc__line" />
                    <div className="demo-doc__grid" />
                  </div>
                  <div className="demo-pdf">
                    <span className="demo-pdf__icon">⤓</span> chart_biscuit_2026-07-17.pdf
                  </div>
                  <div className="demo-caption">Your logo, your doctor line — on every page</div>
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
            {demoPaused ? '▶ Play animation' : '❚❚ Pause animation'}
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
            <h2>Simple monthly pricing</h2>
            <p className="landing__pricing-sub">
              Every plan starts with a {TRIAL_DAYS}-day free trial. Cancel anytime — we keep
              your charts safe for 30 days in case you come back.
            </p>
            <div className="landing__pricing-grid">
              {PLANS.map((p) => (
                <div key={p.key} className={p.key === 'practice_basic' ? 'pricing-card pricing-card--featured' : 'pricing-card'}>
                  {p.key === 'practice_basic' && <span className="pricing-card__flag">Most popular</span>}
                  <h3>{p.name}</h3>
                  <p className="pricing-card__price">
                    ${p.priceMonthly}
                    <span>/mo</span>
                  </p>
                  <p className="pricing-card__tagline">{p.tagline}</p>
                  <ul>
                    {p.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  {!inApp && (
                    <button type="button" className="pricing-card__cta" onClick={() => openSignup(p.key)}>
                      Start free trial
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="landing__pricing-contact">
              Bigger team? Multi-location group? University program?{' '}
              <a href={`mailto:${CONTACT_EMAIL}?subject=ToothOps%20pricing%20for%20a%20larger%20team`}>
                Contact us
              </a>{' '}
              for pricing beyond 5 seats.
            </p>
          </section>
        )}

        {/* -------------------------------------------------- pdf preview --- */}
        <section className="landing__paper">
          <div className="landing__paper-copy">
            <h2>The chart your clients take home</h2>
            <p>
              One click renders the whole procedure as a clean two-page PDF —
              your logo and doctor line up top, full-mouth grids, both
              diagrams, exam findings, and a legend for every AVDC code used.
            </p>
            <ul className="landing__paper-points">
              <li>Five professional document styles</li>
              <li>Patient identity on every page</li>
              <li>Re-open any PDF back into the app — the chart travels inside it</li>
            </ul>
          </div>
          <div className="landing__paper-shot landing__paper-shot--pages">
            <img
              src="/landing-chart.png"
              alt="Page one of a generated dental chart PDF: practice logo and doctor line, diagnosis diagram with anchored comments, oral exam findings with comments, partial Triadan probing grids, and a legend of the AVDC codes used"
              loading="lazy"
            />
            <img
              src="/landing-chart-p2.png"
              alt="Page two of the same chart: nerve block doses, the procedure diagram with an extraction marked, the treatment and surgery report, and the procedure codes used"
              loading="lazy"
            />
          </div>
        </section>

        {/* ------------------------------------------------- final CTA --- */}
        <section className="landing__closer">
          <h2>Ready to put the clipboard down?</h2>
          {inApp ? (
            <button type="button" className="landing__cta" onClick={onOpenApp}>
              Back to the app
            </button>
          ) : cloudEnabled ? (
            <button type="button" className="landing__cta" onClick={() => openSignup()}>
              {PAID_SIGNUP ? `Start your ${TRIAL_DAYS}-day free trial` : 'Create your free account'}
            </button>
          ) : (
            <button type="button" className="landing__cta" onClick={() => setAuth('signin')}>
              Open the charting app
            </button>
          )}
          {!inApp && cloudEnabled && onTryFree && (
            <button type="button" className="landing__cta-ghost" onClick={onTryFree}>
              Try it free — no account
            </button>
          )}
        </section>
      </main>

      <footer className="landing__footer">
        <span>ToothOps Charting — built with veterinary dentists.</span>
        <a href="mailto:bazhip@gmail.com">Contact</a>
      </footer>

      {auth && (
        <div
          className="landing__auth-overlay"
          onClick={() => setAuth(null)}
          role="dialog"
          aria-modal="true"
          aria-label={auth === 'signup' ? 'Create your practice account' : 'Sign in'}
        >
          <div className="landing__auth-panel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="landing__auth-close" onClick={() => setAuth(null)} aria-label="Close">
              ×
            </button>
            <Login onAuthenticate={onAuthenticate} initialMode={auth} embedded initialPlan={signupPlan} />
          </div>
        </div>
      )}
    </div>
  );
};
