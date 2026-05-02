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

export const CodeReferencePanel: React.FC = () => {
  const [query, setQuery] = React.useState('');

  const filtered = React.useMemo(
    () => DENTAL_CODES.filter((c) => matches(c, query)),
    [query]
  );
  const diagnoses = filtered.filter((c) => c.kind === 'diagnosis');
  const procedures = filtered.filter((c) => c.kind === 'procedure');

  return (
    <div className="dental-grid-section">
      <div className="dental-grid__section-header">
        <span className="dental-grid__title">Code Reference</span>
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
          <CodeRefColumn title="Diagnoses" codes={diagnoses} />
          <CodeRefColumn title="Procedures" codes={procedures} />
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
