import React from 'react';
import {
  DENTAL_CODE_GROUPS,
  DentalCode,
  DentalCodeGroup,
} from '../constants/dentalCodes';

/**
 * Always-visible collapsible search panel that lists every dental shorthand
 * code with its definition. Users can scan or search at any time, and
 * working alongside the inline CodeField popup is meant to be belt-and-
 * suspenders — the panel for browsing, the popup for fast in-place input.
 */

function matches(code: DentalCode, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    code.code.toLowerCase().includes(q) ||
    code.definition.toLowerCase().includes(q)
  );
}

interface CodeReferencePanelProps {
  /** Restrict the panel to one kind of code. Omit to show both columns. */
  kind?: 'diagnosis' | 'procedure';
}

const TITLES = { diagnosis: 'Diagnoses', procedure: 'Procedures' } as const;

export const CodeReferencePanel: React.FC<CodeReferencePanelProps> = ({ kind }) => {
  const [query, setQuery] = React.useState('');
  const cardRef = React.useRef<HTMLDivElement>(null);

  // Sidebar mode only (the card is position:sticky there): keep the top
  // anchored under the topbar but never let the bottom pass the frame —
  // the card shrinks against the enclosing card's bottom edge as the
  // section scrolls out. Sticky alone can't resize, so clamp on scroll.
  React.useEffect(() => {
    const card = cardRef.current;
    const frame = card?.parentElement; // the section root = the rail frame
    if (!card || !frame) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const frameRect = frame.getBoundingClientRect();
      // Hidden section (all sections stay mounted under display:none) or
      // stacked layout: drop any inline sizing and wait — the observer
      // below re-fires when the section becomes visible.
      if (frameRect.height === 0 || getComputedStyle(card).position !== 'sticky') {
        card.style.removeProperty('height');
        card.style.removeProperty('max-height');
        return;
      }
      const top = card.getBoundingClientRect().top;
      const viewportMax = window.innerHeight - top - 12;
      const h = Math.max(0, Math.min(viewportMax, frameRect.bottom - top));
      card.style.height = `${h}px`;
      card.style.maxHeight = `${h}px`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // Section switches and diagram zoom resize the frame without any
    // scroll event — recompute on frame size changes too.
    const ro = new ResizeObserver(schedule);
    ro.observe(frame);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  // Filter within each clinical group; groups with no surviving codes
  // drop out entirely (including their header).
  const filteredGroups = React.useMemo(
    () =>
      DENTAL_CODE_GROUPS
        .filter((g) => (kind ? g.kind === kind : true))
        .map((g) => ({ ...g, codes: g.codes.filter((c) => matches(c, query)) }))
        .filter((g) => g.codes.length > 0),
    [query, kind]
  );

  return (
    <div className="dental-grid-section">
      <div className="dental-grid__section-header">
        <span className="dental-grid__title">
          {kind ? `${TITLES[kind]} Reference` : 'Code Reference'}
        </span>
      </div>

      <div className="code-ref" ref={cardRef}>
        <input
          type="text"
          className="code-ref__search"
          placeholder="Search codes or definitions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="code-ref__columns">
          {kind ? (
            <CodeRefColumn title={TITLES[kind]} groups={filteredGroups} />
          ) : (
            <>
              <CodeRefColumn
                title="Diagnoses"
                groups={filteredGroups.filter((g) => g.kind === 'diagnosis')}
              />
              <CodeRefColumn
                title="Procedures"
                groups={filteredGroups.filter((g) => g.kind === 'procedure')}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface CodeRefColumnProps {
  title: string;
  groups: DentalCodeGroup[];
}

const CodeRefColumn: React.FC<CodeRefColumnProps> = ({ title, groups }) => {
  const total = groups.reduce((n, g) => n + g.codes.length, 0);
  return (
    <div className="code-ref__column">
      <h3 className="code-ref__heading">
        {title} <span className="code-ref__count">({total})</span>
      </h3>
      {total === 0 ? (
        <div className="code-ref__empty">No matches.</div>
      ) : (
        <div className="code-ref__list">
          {groups.map((g) => (
            <section key={g.name} className="code-ref__group">
              <h4 className="code-ref__group-head">{g.name}</h4>
              <ul className="code-ref__group-list">
                {g.codes.map((c: DentalCode) => (
                  <li key={c.code} className="code-ref__row">
                    <span className="code-ref__code">{c.code}</span>
                    <span className="code-ref__def">{c.definition}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
