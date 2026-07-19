import React from 'react';
import { ChartSection } from './Layouts';

/**
 * Mobile-only section nav. Renders nothing on wider viewports — a CSS
 * media query in boards.css hides this and shows the layout's native
 * nav (tabs / sidebar / topnav / step list / etc.). On phones the
 * native nav becomes a hard-to-use horizontal scroller, so we swap it
 * for a single trigger that opens a full-width dropdown listing every
 * section by name.
 */

interface MobileSectionMenuProps {
  sections: ChartSection[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
}

export const MobileSectionMenu: React.FC<MobileSectionMenuProps> = ({
  sections, activeId, onSelect,
}) => {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = sections.find((s) => s.id === activeId);

  return (
    <div
      className={`mobile-section-menu${open ? ' mobile-section-menu--open' : ''}`}
      ref={containerRef}
    >
      {/* Disclosure, not an ARIA menu — no arrow-key/roving-focus contract. */}
      <button
        type="button"
        className="mobile-section-menu__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="mobile-section-menu__icon" aria-hidden="true">☰</span>
        <span className="mobile-section-menu__label">{active?.label ?? 'Sections'}</span>
        <span className="mobile-section-menu__chev" aria-hidden="true">▾</span>
      </button>

      {open && (
        <ul className="mobile-section-menu__list">
          {sections.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                aria-current={s.id === activeId ? 'true' : undefined}
                className={`mobile-section-menu__item${s.id === activeId ? ' mobile-section-menu__item--active' : ''}`}
                onClick={() => { onSelect(s.id); setOpen(false); }}
              >
                <span className="mobile-section-menu__num">{String(i + 1).padStart(2, '0')}</span>
                <span className="mobile-section-menu__item-label">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
