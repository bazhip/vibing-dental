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
  const choose = (id: string) => {
    setInternal(id);
    onActiveChange?.(id);
  };
  return (
    <div className="sidebar-layout">
      <MobileSectionMenu sections={sections} activeId={active} onSelect={choose} />
      <nav className="sidebar-layout__nav" role="tablist">
        {sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === active}
            className={`sidebar-layout__nav-item${s.id === active ? ' sidebar-layout__nav-item--active' : ''}`}
            onClick={() => choose(s.id)}
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
