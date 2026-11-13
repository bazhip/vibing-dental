import React from 'react';
import { MobileSectionMenu } from './MobileSectionMenu';

/**
 * Section layout for the chart: a left rail of numbered section links and a
 * single content panel. All sections stay mounted (hidden via display:none)
 * so imperative refs inside — e.g. the diagram SVGs captured for PDF
 * export — survive section switches.
 *
 * On phones the rail is hidden and <MobileSectionMenu> takes over (≤600px,
 * see boards.css).
 */

export interface ChartSection {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface LayoutProps {
  sections: ChartSection[];
  defaultActiveId?: string;
  /** Controlled active section — when set, the parent owns navigation
   *  (so it can jump the user to a section, e.g. on a blocked save). */
  activeId?: string;
  onActiveChange?: (id: string) => void;
  /** Wide screens (≥1280px, boards.css): while the key section is active,
   *  its companion section shows beside it, e.g. the Diagnosis diagram
   *  next to the Charting grid. Narrower screens hide the companion. */
  companions?: Record<string, string>;
}

export const SidebarLayout: React.FC<LayoutProps> = ({
  sections,
  defaultActiveId,
  activeId,
  onActiveChange,
  companions,
}) => {
  const initial = activeId ?? defaultActiveId ?? sections[0]?.id;
  const [internal, setInternal] = React.useState(initial);
  // Follow the controlled value when the parent drives it.
  React.useEffect(() => {
    if (activeId !== undefined) setInternal(activeId);
  }, [activeId]);
  const active = activeId ?? internal;
  const companion = companions?.[active];
  const mainRef = React.useRef<HTMLElement>(null);
  const choose = (id: string) => {
    setInternal(id);
    onActiveChange?.(id);
    // A user-chosen section starts at its top with focus on its heading
    // (not wherever the previous section was scrolled to).
    window.requestAnimationFrame(() => {
      const main = mainRef.current;
      if (!main) return;
      const panel = main.querySelector<HTMLElement>(`[data-section-id="${id}"]`);
      const top = main.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-height')) || 72) - 12;
      if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top) });
      const heading = panel?.querySelector<HTMLElement>('h2');
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    });
  };
  return (
    <div className={companion ? 'sidebar-layout sidebar-layout--paired' : 'sidebar-layout'}>
      <MobileSectionMenu sections={sections} activeId={active} onSelect={choose} />
      {/* Plain navigation, not an ARIA tablist — the buttons have no
          arrow-key contract, and sections read better as nav anyway. */}
      <nav className="sidebar-layout__nav" aria-label="Chart sections">
        {sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-current={s.id === active ? 'true' : undefined}
            className={`sidebar-layout__nav-item${s.id === active ? ' sidebar-layout__nav-item--active' : ''}`}
            onClick={() => choose(s.id)}
            // The paired layout narrows the rail to numbers only.
            title={companion ? s.label : undefined}
          >
            <span className="sidebar-layout__nav-num">{String(i + 1).padStart(2, '0')}</span>
            <span className="sidebar-layout__nav-label">{s.label}</span>
          </button>
        ))}
      </nav>
      <main className="sidebar-layout__main" ref={mainRef}>
        {sections.map((s) => (
          <div
            key={s.id}
            className={s.id === companion ? 'sidebar-layout__panel sidebar-layout__panel--companion' : 'sidebar-layout__panel'}
            data-section-id={s.id}
            // The companion's visibility is left to CSS (shown only where
            // there's room for both).
            style={s.id === active || s.id === companion ? undefined : { display: 'none' }}
          >
            {/* Read-only locking happens per section in EntryGrid (each
                lockable block sits in its own disabled fieldset), so
                reference-only content like the codes panel stays
                scrollable and searchable on locked charts. */}
            {s.content}
          </div>
        ))}
      </main>
    </div>
  );
};
