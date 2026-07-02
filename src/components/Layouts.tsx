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
}

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
            {s.content}
          </div>
        ))}
      </main>
    </div>
  );
};
