import React from 'react';
import { DENTAL_CODES, DentalCode } from '../constants/dentalCodes';

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

  const filtered = React.useMemo(
    () =>
      DENTAL_CODES.filter(
        (c) => (kind ? c.kind === kind : true) && matches(c, query)
      ),
    [query, kind]
  );

  return (
    <div className="dental-grid-section">
      <div className="dental-grid__section-header">
        <span className="dental-grid__title">
          {kind ? `${TITLES[kind]} Reference` : 'Code Reference'}
        </span>
      </div>

      <div className="code-ref">
        <input
          type="text"
          className="code-ref__search"
          placeholder="Search codes or definitions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="code-ref__columns">
          {kind ? (
            <CodeRefColumn title={TITLES[kind]} codes={filtered} />
          ) : (
            <>
              <CodeRefColumn
                title="Diagnoses"
                codes={filtered.filter((c) => c.kind === 'diagnosis')}
              />
              <CodeRefColumn
                title="Procedures"
                codes={filtered.filter((c) => c.kind === 'procedure')}
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
  codes: DentalCode[];
}

const CodeRefColumn: React.FC<CodeRefColumnProps> = ({ title, codes }) => (
  <div className="code-ref__column">
    <h3 className="code-ref__heading">
      {title} <span className="code-ref__count">({codes.length})</span>
    </h3>
    {codes.length === 0 ? (
      <div className="code-ref__empty">No matches.</div>
    ) : (
      <ul className="code-ref__list">
        {codes.map((c) => (
          <li key={c.code} className="code-ref__row">
            <span className="code-ref__code">{c.code}</span>
            <span className="code-ref__def">{c.definition}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);
