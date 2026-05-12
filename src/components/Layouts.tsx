import React from 'react';
import { MobileSectionMenu } from './MobileSectionMenu';

/**
 * Pluggable layout renderers. They all consume the same `sections` array
 * (a list of `{ id, label, content }`) so the rest of the app doesn't have
 * to know which design board the user is currently previewing.
 *
 * Sections are kept mounted (not unmounted) for the active-tab pattern so
 * imperative refs inside (e.g. the diagram SVGs that get captured for PDF
 * export) survive layout switches.
 *
 * On phones every navigated layout (tabs, sidebar, topnav, threecol,
 * wizard) renders a `<MobileSectionMenu>` at the top — the layout's
 * native nav is hidden via CSS at ≤600px.
 */

export interface ChartSection {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface LayoutProps {
  sections: ChartSection[];
  defaultActiveId?: string;
}

/* -------- Tabs (default) ------------------------------------------------- */
export const TabsLayout: React.FC<LayoutProps> = ({ sections, defaultActiveId }) => {
  const initial = defaultActiveId ?? sections[0]?.id;
  const [active, setActive] = React.useState(initial);
  return (
    <div className="tabs">
      <MobileSectionMenu sections={sections} activeId={active} onSelect={setActive} />
      <div className="tabs__bar" role="tablist">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === active}
            className={`tabs__tab${s.id === active ? ' tabs__tab--active' : ''}`}
            onClick={() => setActive(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="tabs__panels">
        {sections.map((s) => (
          <div
            key={s.id}
            role="tabpanel"
            className="tabs__panel"
            style={s.id === active ? undefined : { display: 'none' }}
          >
            {s.content}
          </div>
        ))}
      </div>
    </div>
  );
};

/* -------- Sidebar (left rail nav, single content panel) ------------------ */
export const SidebarLayout: React.FC<LayoutProps> = ({ sections, defaultActiveId }) => {
  const initial = defaultActiveId ?? sections[0]?.id;
  const [active, setActive] = React.useState(initial);
  return (
    <div className="sidebar-layout">
      <MobileSectionMenu sections={sections} activeId={active} onSelect={setActive} />
      <nav className="sidebar-layout__nav" role="tablist">
        {sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === active}
            className={`sidebar-layout__nav-item${s.id === active ? ' sidebar-layout__nav-item--active' : ''}`}
            onClick={() => setActive(s.id)}
          >
            <span className="sidebar-layout__nav-num">{String(i + 1).padStart(2, '0')}</span>
            <span className="sidebar-layout__nav-label">{s.label}</span>
          </button>
        ))}
      </nav>
      <main className="sidebar-layout__main">
        {sections.map((s) => (
          <div
            key={s.id}
            role="tabpanel"
            className="sidebar-layout__panel"
            style={s.id === active ? undefined : { display: 'none' }}
          >
            <header className="sidebar-layout__panel-header">
              <h2>{s.label}</h2>
            </header>
            {s.content}
          </div>
        ))}
      </main>
    </div>
  );
};

/* -------- Stacked (all sections always visible as cards) ----------------- */
export const StackedLayout: React.FC<LayoutProps> = ({ sections }) => {
  return (
    <div className="stacked-layout">
      {sections.map((s, i) => (
        <section key={s.id} className="stacked-layout__section">
          <header className="stacked-layout__header">
            <span className="stacked-layout__num">{String(i + 1).padStart(2, '0')}</span>
            <h2 className="stacked-layout__title">{s.label}</h2>
          </header>
          <div className="stacked-layout__body">
            {s.content}
          </div>
        </section>
      ))}
    </div>
  );
};

/* -------- Top-nav (horizontal nav bar above content; Stripe/PayPal feel) - */
export const TopNavLayout: React.FC<LayoutProps> = ({ sections, defaultActiveId }) => {
  const initial = defaultActiveId ?? sections[0]?.id;
  const [active, setActive] = React.useState(initial);
  return (
    <div className="topnav-layout">
      <MobileSectionMenu sections={sections} activeId={active} onSelect={setActive} />
      <nav className="topnav-layout__bar" role="tablist">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === active}
            className={`topnav-layout__tab${s.id === active ? ' topnav-layout__tab--active' : ''}`}
            onClick={() => setActive(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="topnav-layout__content">
        {sections.map((s) => (
          <div
            key={s.id}
            role="tabpanel"
            className="topnav-layout__panel"
            style={s.id === active ? undefined : { display: 'none' }}
          >
            {s.content}
          </div>
        ))}
      </div>
    </div>
  );
};

/* -------- Three-column (nav rail | main | aux) Twitter / Slack feel ------ */
export const ThreeColumnLayout: React.FC<LayoutProps> = ({ sections, defaultActiveId }) => {
  const initial = defaultActiveId ?? sections[0]?.id;
  const [active, setActive] = React.useState(initial);
  const activeSection = sections.find((s) => s.id === active) ?? sections[0];
  return (
    <div className="threecol-layout">
      <MobileSectionMenu sections={sections} activeId={active} onSelect={setActive} />
      <nav className="threecol-layout__rail" role="tablist">
        {sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === active}
            className={`threecol-layout__rail-item${s.id === active ? ' threecol-layout__rail-item--active' : ''}`}
            onClick={() => setActive(s.id)}
            title={s.label}
          >
            <span className="threecol-layout__rail-icon">{glyphFor(i)}</span>
            <span className="threecol-layout__rail-label">{s.label}</span>
          </button>
        ))}
      </nav>
      <main className="threecol-layout__main">
        <header className="threecol-layout__header">
          <h2>{activeSection?.label}</h2>
        </header>
        <div className="threecol-layout__feed">
          {sections.map((s) => (
            <div
              key={s.id}
              role="tabpanel"
              className="threecol-layout__panel"
              style={s.id === active ? undefined : { display: 'none' }}
            >
              {s.content}
            </div>
          ))}
        </div>
      </main>
      <aside className="threecol-layout__aux">
        <div className="threecol-layout__aux-card">
          <strong>Quick reference</strong>
          <p>Use the rail at left to move through the chart. All values save automatically as you type.</p>
        </div>
        <div className="threecol-layout__aux-card threecol-layout__aux-card--muted">
          <strong>Keyboard</strong>
          <ul>
            <li><kbd>1</kbd>–<kbd>{sections.length}</kbd> jump to a section</li>
          </ul>
        </div>
      </aside>
    </div>
  );
};

/* -------- Wizard (one section at a time; Prev/Next; PayPal/onboarding) --- */
export const WizardLayout: React.FC<LayoutProps> = ({ sections, defaultActiveId }) => {
  const initialIdx = Math.max(
    0,
    sections.findIndex((s) => s.id === (defaultActiveId ?? sections[0]?.id))
  );
  const [idx, setIdx] = React.useState(initialIdx);
  const active = sections[idx];
  const handleMobileSelect = (id: string) => {
    const next = sections.findIndex((s) => s.id === id);
    if (next >= 0) setIdx(next);
  };
  return (
    <div className="wizard-layout">
      <MobileSectionMenu
        sections={sections}
        activeId={active?.id}
        onSelect={handleMobileSelect}
      />
      <ol className="wizard-layout__steps">
        {sections.map((s, i) => (
          <li
            key={s.id}
            className={`wizard-layout__step${i === idx ? ' wizard-layout__step--active' : ''}${i < idx ? ' wizard-layout__step--done' : ''}`}
          >
            <button
              type="button"
              className="wizard-layout__step-button"
              onClick={() => setIdx(i)}
            >
              <span className="wizard-layout__step-dot">
                {i < idx ? '✓' : i + 1}
              </span>
              <span className="wizard-layout__step-label">{s.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="wizard-layout__panel">
        <h2 className="wizard-layout__panel-title">{active?.label}</h2>
        {sections.map((s, i) => (
          <div
            key={s.id}
            className="wizard-layout__panel-body"
            style={i === idx ? undefined : { display: 'none' }}
          >
            {s.content}
          </div>
        ))}
        <div className="wizard-layout__nav">
          <button
            type="button"
            className="wizard-layout__nav-button"
            disabled={idx === 0}
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
          >
            ← Previous
          </button>
          <span className="wizard-layout__progress">
            Step {idx + 1} of {sections.length}
          </span>
          <button
            type="button"
            className="wizard-layout__nav-button wizard-layout__nav-button--primary"
            disabled={idx === sections.length - 1}
            onClick={() => setIdx((i) => Math.min(sections.length - 1, i + 1))}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
};

function glyphFor(i: number): string {
  const glyphs = ['◐', '◑', '◒', '◓', '◧', '◨', '◫', '◰'];
  return glyphs[i % glyphs.length];
}

/* -------- Picker --------------------------------------------------------- */
export type LayoutKind =
  | 'tabs'
  | 'sidebar'
  | 'stacked'
  | 'topnav'
  | 'threecol'
  | 'wizard';

export const SectionLayout: React.FC<LayoutProps & { layout: LayoutKind }> = ({
  layout,
  ...rest
}) => {
  switch (layout) {
    case 'sidebar':  return <SidebarLayout {...rest} />;
    case 'stacked':  return <StackedLayout {...rest} />;
    case 'topnav':   return <TopNavLayout {...rest} />;
    case 'threecol': return <ThreeColumnLayout {...rest} />;
    case 'wizard':   return <WizardLayout {...rest} />;
    default:         return <TabsLayout {...rest} />;
  }
};
