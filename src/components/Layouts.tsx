import React from 'react';
import { pinnedSectionNav } from '../utils/pinnedSectionNav';
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
}

export const SidebarLayout: React.FC<LayoutProps> = ({
  sections,
  defaultActiveId,
  activeId,
  onActiveChange,
}) => {
  const initial = activeId ?? defaultActiveId ?? sections[0]?.id;
  const [internal, setInternal] = React.useState(initial);
  // Follow the controlled value when the parent drives it.
  React.useEffect(() => {
    if (activeId !== undefined) setInternal(activeId);
  }, [activeId]);
  const active = activeId ?? internal;
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
      // Clear the sticky topbar — and the pinned section nav on smaller screens.
      const menuH = pinnedSectionNav()?.getBoundingClientRect().height ?? 0;
      const top = main.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(main).getPropertyValue('--topbar-height')) || 72) - menuH - 12;
      if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top) });
      const heading = panel?.querySelector<HTMLElement>('h2');
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    });
  };
  // Tablets show the sections as a sideways-scrolling tab strip: fade the
  // edges only where more tabs are hidden, and keep the active tab in view.
  const navRef = React.useRef<HTMLElement>(null);
  const [fade, setFade] = React.useState({ start: false, end: false });
  const updateFade = React.useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const scrollable = nav.scrollWidth > nav.clientWidth + 1;
    const next = {
      start: scrollable && nav.scrollLeft > 1,
      end: scrollable && nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1,
    };
    setFade((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, []);
  React.useEffect(() => {
    updateFade();
    window.addEventListener('resize', updateFade);
    return () => window.removeEventListener('resize', updateFade);
  }, [updateFade]);
  React.useEffect(() => {
    const nav = navRef.current;
    const item = nav?.querySelector<HTMLElement>('.sidebar-layout__nav-item--active');
    if (!nav || !item || nav.scrollWidth <= nav.clientWidth + 1) return;
    // Center the active tab where possible (horizontal only — never
    // scrolls the page).
    const left = item.offsetLeft - (nav.clientWidth - item.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [active]);

  return (
    <div className="sidebar-layout">
      <MobileSectionMenu sections={sections} activeId={active} onSelect={choose} />
      {/* Plain navigation, not an ARIA tablist — the buttons have no
          arrow-key contract, and sections read better as nav anyway. */}
      <nav
        ref={navRef}
        className={`sidebar-layout__nav${fade.start ? ' sidebar-layout__nav--fade-start' : ''}${fade.end ? ' sidebar-layout__nav--fade-end' : ''}`}
        aria-label="Chart sections"
        onScroll={updateFade}
      >
        {sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-current={s.id === active ? 'true' : undefined}
            className={`sidebar-layout__nav-item${s.id === active ? ' sidebar-layout__nav-item--active' : ''}`}
            onClick={() => choose(s.id)}
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
            className="sidebar-layout__panel"
            data-section-id={s.id}
            style={s.id === active ? undefined : { display: 'none' }}
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
