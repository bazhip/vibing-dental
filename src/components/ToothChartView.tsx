import React from 'react';
import { DiagramComment, Species, ToothData, ToothMarks } from '../types';
import { TOOTH_DIAGRAMS } from '../constants/toothShapes';
import { COLUMN_RANGES } from '../constants/columnDefinitions';
import { ToothDiagram } from './ToothDiagram';
import {
  FINDING_COLUMNS,
  findToothNote,
  hasFindings,
  setToothNote,
  toothDisplayName,
  toothWalkOrder,
} from '../utils/toothChart';

/**
 * By-tooth charting: an alternative to the spreadsheet grid where the
 * person charting clicks a tooth on the (numbered) diagram and records
 * everything about it in one panel — measurements, missing, diagnosis
 * note, "plan to extract", and later "extracted" plus a procedure note.
 *
 * It owns no chart data: every field writes the same state the grid and
 * the Diagnosis / Procedure diagrams use, so switching views (or using
 * both) never loses or duplicates anything.
 */
export interface ToothChartViewProps {
  species: Species;
  toothData: ToothData[];
  setToothData: (update: (prev: ToothData[]) => ToothData[]) => void;
  /** Pre-surgery marks (Diagnosis) — `missing` lives here. */
  preMarks: ToothMarks;
  onToggleMissing: (triadan: number) => void;
  /** Post-surgery marks with pre-missing teeth folded in (Procedure). */
  effectivePostMarks: ToothMarks;
  setPostMarks: (update: (prev: ToothMarks) => ToothMarks) => void;
  preComments: DiagramComment[];
  setPreComments: (update: (prev: DiagramComment[]) => DiagramComment[]) => void;
  postComments: DiagramComment[];
  setPostComments: (update: (prev: DiagramComment[]) => DiagramComment[]) => void;
  plannedExtractions: number[];
  setPlannedExtraction: (triadan: number, planned: boolean) => void;
  /** View-only chart: teeth can still be browsed, nothing edits. */
  readOnly?: boolean;
  highlightTriadan?: number | null;
  /** Rendered in the section header (the Grid / By tooth switch). */
  headerAccessory?: React.ReactNode;
}

const noop = () => {};

/** Enter in a single-line field would submit the chart form (which opens
 *  the PDF preview) — swallow it, and treat it as "next field". */
const blockEnter: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const form = e.currentTarget.closest('.tooth-chart__panel');
  if (!form) return;
  const fields = Array.from(form.querySelectorAll<HTMLInputElement>('input.tooth-chart__finding-input:not(:disabled)'));
  const i = fields.indexOf(e.currentTarget);
  fields[i + 1]?.focus();
};

function outOfRange(key: string, value: string): string | null {
  const range = COLUMN_RANGES[key];
  const t = value.trim();
  if (!range || !t) return null;
  const ok = t.split(/\s+/).every((n) => /^\d+(\.\d+)?$/.test(n) && Number(n) >= range[0] && Number(n) <= range[1]);
  return ok ? null : `${range[0]}–${range[1]}`;
}

export function ToothChartView({
  species,
  toothData,
  setToothData,
  preMarks,
  onToggleMissing,
  effectivePostMarks,
  setPostMarks,
  preComments,
  setPreComments,
  postComments,
  setPostComments,
  plannedExtractions,
  setPlannedExtraction,
  readOnly = false,
  highlightTriadan,
  headerAccessory,
}: ToothChartViewProps) {
  const diagram = TOOTH_DIAGRAMS[species];
  const [selected, setSelected] = React.useState<number | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // A species switch swaps the numbering; drop a selection that no
  // longer exists.
  React.useEffect(() => {
    if (selected != null && !diagram.teeth.some((t) => t.triadan === selected)) setSelected(null);
  }, [diagram, selected]);

  const order = React.useMemo(() => toothWalkOrder(diagram.teeth.map((t) => t.triadan)), [diagram]);
  const planned = React.useMemo(() => new Set(plannedExtractions), [plannedExtractions]);
  const rowsByTriadan = React.useMemo(
    () => new Map(toothData.map((r) => [r.triadan, r])),
    [toothData]
  );

  const toothFlags = React.useMemo(() => {
    const flags: Record<number, { charted?: boolean; planned?: boolean }> = {};
    for (const t of diagram.teeth) {
      const charted =
        hasFindings(rowsByTriadan.get(t.triadan)) ||
        !!findToothNote(preComments, t.triadan) ||
        !!findToothNote(postComments, t.triadan);
      const isPlanned = planned.has(t.triadan) && effectivePostMarks[t.triadan] !== 'extracted';
      if (charted || isPlanned) flags[t.triadan] = { charted, planned: isPlanned };
    }
    return flags;
  }, [diagram, rowsByTriadan, preComments, postComments, planned, effectivePostMarks]);

  const select = (triadan: number) => {
    setSelected(triadan);
    // On narrow screens the panel stacks under the diagram — bring it up.
    requestAnimationFrame(() => {
      const el = panelRef.current;
      if (el && typeof el.scrollIntoView === 'function' && window.matchMedia?.('(max-width: 900px)').matches) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  const step = (dir: 1 | -1) => {
    if (selected == null) { setSelected(order[0] ?? null); return; }
    const i = order.indexOf(selected);
    const next = order[(i + dir + order.length) % order.length];
    setSelected(next);
  };

  const tooth = selected != null ? diagram.teeth.find((t) => t.triadan === selected) : undefined;
  const row = selected != null ? rowsByTriadan.get(selected) : undefined;
  const isMissing = selected != null && preMarks[selected] === 'missing';
  const isExtracted = selected != null && effectivePostMarks[selected] === 'extracted';
  const isPlanned = selected != null && planned.has(selected);

  const setField = (key: keyof ToothData, value: string) => {
    if (selected == null) return;
    setToothData((prev) => prev.map((r) => (r.triadan === selected ? { ...r, [key]: value } : r)));
  };

  const setExtracted = (triadan: number, on: boolean) =>
    setPostMarks((prev) => {
      const next = { ...prev };
      if (on) next[triadan] = 'extracted';
      else delete next[triadan];
      return next;
    });

  const pendingPlanned = plannedExtractions.filter(
    (t) => effectivePostMarks[t] !== 'extracted' && preMarks[t] !== 'missing'
  );
  const confirmAllPlanned = () =>
    setPostMarks((prev) => {
      const next = { ...prev };
      for (const t of pendingPlanned) next[t] = 'extracted';
      return next;
    });

  const prevTooth = selected != null ? order[(order.indexOf(selected) - 1 + order.length) % order.length] : null;
  const nextTooth = selected != null ? order[(order.indexOf(selected) + 1) % order.length] : null;

  return (
    <div className="dental-grid-section tooth-chart">
      <div className="dental-grid__section-header">
        <h2 className="dental-grid__title">Charting</h2>
        {headerAccessory}
      </div>

      <div className="tooth-chart__layout">
        <div className="tooth-chart__diagram diagram-view__canvas">
          <ToothDiagram
            species={species}
            toothMarks={effectivePostMarks}
            onToothMarksChange={noop}
            comments={[]}
            onCommentsChange={noop}
            strokes={[]}
            onStrokesChange={noop}
            tool="mark"
            strokeColor="#000"
            strokeWidth={1}
            showNumbers
            onToothSelect={select}
            selectedTriadan={selected}
            toothFlags={toothFlags}
            highlightTriadan={highlightTriadan}
          />
          <ul className="tooth-chart__legend" aria-label="Diagram key">
            <li><span className="tooth-chart__swatch tooth-chart__swatch--charted" /> Charted</li>
            <li><span className="tooth-chart__swatch tooth-chart__swatch--planned" /> Planned extraction</li>
            <li><span className="tooth-chart__swatch tooth-chart__swatch--extracted">✕</span> Extracted</li>
            <li><span className="tooth-chart__swatch tooth-chart__swatch--missing" /> Missing</li>
          </ul>
        </div>

        <div className="tooth-chart__panel" ref={panelRef} aria-live="polite">
          {!tooth ? (
            <div className="tooth-chart__empty">
              <p><strong>Click a tooth</strong> on the diagram to chart it.</p>
              <p className="tooth-chart__hint">
                Everything you enter here also fills the Charting grid and the
                Diagnosis / Procedure diagrams.
              </p>
              <button type="button" className="diagram-view__action" onClick={() => step(1)}>
                Start at {order[0]} →
              </button>
            </div>
          ) : (
            <>
              <div className="tooth-chart__nav">
                <button
                  type="button"
                  className="diagram-view__action"
                  onClick={() => step(-1)}
                  aria-label={`Previous tooth (${prevTooth})`}
                  title="Previous tooth"
                >
                  ← {prevTooth}
                </button>
                <div className="tooth-chart__heading">
                  <div className="tooth-chart__number">{tooth.triadan}</div>
                  <div className="tooth-chart__name">
                    {toothDisplayName(tooth.triadan, tooth.label)}
                    <span className="tooth-chart__abbr"> ({tooth.label.toUpperCase()})</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="diagram-view__action"
                  onClick={() => step(1)}
                  aria-label={`Next tooth (${nextTooth})`}
                  title="Next tooth"
                >
                  {nextTooth} →
                </button>
              </div>

              <fieldset className="tooth-chart__fields" disabled={readOnly}>
                <label className="tooth-chart__check">
                  <input
                    type="checkbox"
                    checked={isMissing}
                    onChange={() => onToggleMissing(tooth.triadan)}
                  />
                  Missing (before this visit)
                </label>

                <div className="tooth-chart__group-title">Findings</div>
                <div className="tooth-chart__findings">
                  {FINDING_COLUMNS.map((col) => {
                    const v = row?.[col.key];
                    const value = typeof v === 'string' ? v : '';
                    const bad = outOfRange(col.key, value);
                    const id = `tooth-chart-${col.key}`;
                    return (
                      <label key={col.key} className="tooth-chart__finding" htmlFor={id}>
                        <span>{col.name}</span>
                        <input
                          id={id}
                          className={`tooth-chart__finding-input${bad ? ' tooth-chart__finding-input--bad' : ''}`}
                          value={value}
                          inputMode="decimal"
                          autoComplete="off"
                          disabled={isMissing}
                          aria-invalid={bad ? true : undefined}
                          title={bad ? `Expected ${bad}` : undefined}
                          placeholder={COLUMN_RANGES[col.key] ? `${COLUMN_RANGES[col.key][0]}–${COLUMN_RANGES[col.key][1]}` : ''}
                          onChange={(e) => setField(col.key, e.target.value)}
                          onKeyDown={blockEnter}
                        />
                      </label>
                    );
                  })}
                </div>

                <label className="tooth-chart__note">
                  <span className="tooth-chart__group-title">Diagnosis note</span>
                  <textarea
                    rows={2}
                    placeholder="e.g. Fractured crown, pulp exposure"
                    value={findToothNote(preComments, tooth.triadan)?.text ?? ''}
                    onChange={(e) => {
                      const text = e.target.value;
                      setPreComments((prev) => setToothNote(prev, tooth.triadan, text));
                    }}
                  />
                </label>

                <div className="tooth-chart__group-title">Extraction</div>
                <div className="tooth-chart__extraction">
                  <label className="tooth-chart__check">
                    <input
                      type="checkbox"
                      checked={isPlanned}
                      disabled={isMissing}
                      onChange={(e) => setPlannedExtraction(tooth.triadan, e.target.checked)}
                    />
                    Plan to extract
                  </label>
                  <label className="tooth-chart__check">
                    <input
                      type="checkbox"
                      checked={isExtracted}
                      disabled={isMissing}
                      onChange={(e) => setExtracted(tooth.triadan, e.target.checked)}
                    />
                    Extracted
                  </label>
                </div>

                <label className="tooth-chart__note">
                  <span className="tooth-chart__group-title">Procedure note</span>
                  <textarea
                    rows={2}
                    placeholder="e.g. Surgical extraction, flap closed with 5-0"
                    value={findToothNote(postComments, tooth.triadan)?.text ?? ''}
                    onChange={(e) => {
                      const text = e.target.value;
                      setPostComments((prev) => setToothNote(prev, tooth.triadan, text));
                    }}
                  />
                </label>
              </fieldset>
            </>
          )}

          {plannedExtractions.length > 0 && (
            <div className="tooth-chart__plan">
              <div className="tooth-chart__group-title">Extraction plan</div>
              <ul className="tooth-chart__plan-list">
                {plannedExtractions.map((t) => {
                  const done = effectivePostMarks[t] === 'extracted';
                  return (
                    <li key={t}>
                      <button
                        type="button"
                        className={`tooth-chart__plan-chip${done ? ' tooth-chart__plan-chip--done' : ''}${t === selected ? ' tooth-chart__plan-chip--selected' : ''}`}
                        onClick={() => select(t)}
                        title={done ? `${t} — extracted` : `${t} — not yet marked extracted`}
                      >
                        {done ? '✓ ' : ''}{t}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="tooth-chart__plan-status">
                {pendingPlanned.length === 0
                  ? 'All planned extractions confirmed.'
                  : `${plannedExtractions.filter((t) => effectivePostMarks[t] === 'extracted').length} of ${plannedExtractions.length} confirmed extracted.`}
                {pendingPlanned.length > 0 && !readOnly && (
                  <button type="button" className="diagram-view__action" onClick={confirmAllPlanned}>
                    Mark {pendingPlanned.length === 1 ? 'it' : `all ${pendingPlanned.length}`} extracted
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
