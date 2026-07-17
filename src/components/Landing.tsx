import React from 'react';
import { Login } from './Login';
import { cloudEnabled } from '../utils/supabaseClient';
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
  const inApp = !!onOpenApp;

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
                <button type="button" className="landing__nav-cta" onClick={() => setAuth('signup')}>
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
            <p className="landing__eyebrow">For veterinary dental teams</p>
            <h1 className="landing__headline">
              Chart the procedure.
              <br />
              The paperwork does itself.
            </h1>
            <p className="landing__sub">
              Chairside dental charting for veterinary practices — full-mouth
              Triadan grids, AVDC nomenclature, interactive tooth diagrams,
              and a client-ready PDF with your logo on it the moment you
              finish.
            </p>
            <div className="landing__cta-row">
              {inApp ? (
                <button type="button" className="landing__cta" onClick={onOpenApp}>
                  Back to the app
                </button>
              ) : cloudEnabled ? (
                <>
                  <button type="button" className="landing__cta" onClick={() => setAuth('signup')}>
                    Create your practice account
                  </button>
                  {onTryFree && (
                    <button type="button" className="landing__cta-ghost" onClick={onTryFree}>
                      Try it free — no account
                    </button>
                  )}
                  <span className="landing__cta-note">
                    Free in early access · no card required
                    {onTryFree ? ' · trial PDFs are stamped TRIAL' : ''}
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
          <div className="landing__hero-demo" aria-hidden="true">
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
        </section>

        {/* --------------------------------------------------- features --- */}
        <section className="landing__features">
          <div className="landing__feature">
            <h3>Charts like a spreadsheet</h3>
            <p>
              Full-mouth Triadan grids for feline, canine, and deciduous
              dentition. Tab and Enter move like the tools your team already
              knows — probing depths in, eyes on the patient.
            </p>
          </div>
          <div className="landing__feature">
            <h3>Speaks AVDC</h3>
            <p>
              Official nomenclature and abbreviations throughout, with a
              codes legend printed on every chart so the record reads
              cleanly in any hands.
            </p>
          </div>
          <div className="landing__feature">
            <h3>Your name on every page</h3>
            <p>
              Practice logo and doctor line are embedded automatically. Every
              PDF carries its own data, so a saved chart re-opens in the app
              years later — no lock-in, ever.
            </p>
          </div>
          <div className="landing__feature">
            <h3>Mark it missing, everywhere</h3>
            <p>
              Diagnosis and procedure diagrams stay in sync with the grid —
              cross a tooth out once and the whole record follows, chart to
              PDF.
            </p>
          </div>
          <div className="landing__feature">
            <h3>Hands-free when gloved</h3>
            <p>
              Voice dictation with AI autofill charts findings while you work
              — bring your own keys, your data goes nowhere else.
            </p>
          </div>
          <div className="landing__feature">
            <h3>Your charts, everywhere</h3>
            <p>
              Practice accounts autosave every chart to the cloud and keep a
              local copy chairside, so a dropped connection never loses a
              mouth.
            </p>
          </div>
        </section>

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
          <div className="landing__paper-shot">
            <img
              src={`${process.env.PUBLIC_URL}/landing-chart.png`}
              alt="A generated dental chart PDF: logo and doctor line, tooth diagram, oral exam findings, and full-mouth Triadan grids"
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
            <button type="button" className="landing__cta" onClick={() => setAuth('signup')}>
              Create your practice account
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
            <Login onAuthenticate={onAuthenticate} initialMode={auth} embedded />
          </div>
        </div>
      )}
    </div>
  );
};
