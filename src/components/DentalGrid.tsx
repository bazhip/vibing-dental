import React, { useRef } from 'react';
import {
  DataGrid,
  Column,
  RenderEditCellProps,
  DataGridHandle,
} from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { ToothData, ToothMarks } from '../types';

interface DentalGridProps {
  toothData: ToothData[];
  onToothDataChange: (rows: ToothData[]) => void;
  /** Diagnosis-diagram marks — rows whose tooth is marked `missing` render
   *  crossed out, and the leading column's button toggles that mark. */
  toothMarks: ToothMarks;
  onToggleMissing: (triadan: number) => void;
  /** Tooth row to flash (AI autofill just edited it). */
  highlightTriadan?: number | null;
  /** The patient's previous visit, keyed by triadan — rendered as muted
   *  hints in empty cells and "Last visit" tooltips on filled ones.
   *  Reference only; hinted cells stay empty until typed into. */
  priorToothData?: Record<number, ToothData> | null;
  /** Teeth already gone (missing/extracted) at the previous visit — the
   *  new-visit flow pre-marks these missing; the Missing column badges
   *  them as carried forward rather than found today. */
  priorGoneTeeth?: Set<number> | null;
}

/**
 * Data grid component for dental chart entry. A single click on any
 * editable cell starts typing; Excel-style key behavior throughout:
 *
 *   - Tab / Shift+Tab   commit and move to the next / previous cell
 *   - Enter             commit and move to the same column in the next row
 *   - Escape            cancel and discard the edit
 *
 * The grid ref exposes `setActivePosition(position, options)`, which is
 * how we drive the Enter-advances-row behavior — the cell editor commits
 * via `onClose(true)`, then we explicitly select the row below.
 *
 * Enter is also blocked from bubbling to the enclosing <form>, which
 * would otherwise submit and open the PDF preview modal.
 */

// Editable columns span idx 3 (mobility) … 10 (pdstate). Tab wraps
// forward to the next row's first editable column; Shift+Tab wraps
// back to the previous row's last editable column. Off-page edges
// are no-ops so focus stays in the grid.
const FIRST_EDITABLE = 3;
const LAST_EDITABLE = 10;

/** The bits of grid state the module-scope editor needs — refs only, so
 *  the editor component's identity never changes (recreating it per
 *  render made the grid remount its editor on every keystroke). */
interface EditorWiring {
  gridRef: React.RefObject<DataGridHandle | null>;
  rowCountRef: React.MutableRefObject<number>;
}

const EditorWiringContext = React.createContext<EditorWiring | null>(null);

/** Plain input — measurements here are numeric grades (mobility, pocket
 *  depths, PD stage), so the dental-code autocomplete that CodeField
 *  provides elsewhere would only get in the way. */
function CodeCellEditor({
  column,
  row,
  rowIdx,
  onRowChange,
  onClose,
}: RenderEditCellProps<ToothData>) {
  const wiring = React.useContext(EditorWiringContext);
  const key = column.key as keyof ToothData;
  const current = row[key];
  const value = typeof current === 'string' ? current : '';
  const lastRowIdx = (wiring?.rowCountRef.current ?? 0) - 1;

  const advance = (nextRow: number, nextIdx: number, enableEditor: boolean) => {
    if (nextRow < 0 || nextRow > lastRowIdx) return;
    queueMicrotask(() => {
      wiring?.gridRef.current?.setActivePosition(
        { rowIdx: nextRow, idx: nextIdx },
        { enableEditor, shouldFocus: true }
      );
    });
  };

  const handleKeyDown: React.KeyboardEventHandler = (e) => {
    if (e.key === 'Tab') {
      // Drive Tab navigation explicitly so it can wrap across rows —
      // left to the browser, Tab would leave the grid entirely.
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
      if (e.shiftKey) {
        if (column.idx > FIRST_EDITABLE) {
          advance(rowIdx, column.idx - 1, false);
        } else if (rowIdx > 0) {
          advance(rowIdx - 1, LAST_EDITABLE, false);
        }
      } else {
        if (column.idx < LAST_EDITABLE) {
          advance(rowIdx, column.idx + 1, false);
        } else if (rowIdx < lastRowIdx) {
          advance(rowIdx + 1, FIRST_EDITABLE, false);
        }
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      // Commit, then move down a row in the same column — Enter and
      // Space both, so a run of probing depths can be entered exactly
      // as it's called out ("3 [space] 2 [space] 4 …"). These cells
      // hold short grades/codes; a literal space is never content.
      // Enter is also blocked from bubbling to the form (which would
      // submit).
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
      advance(rowIdx + 1, column.idx, false);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose(false);
      return;
    }
  };

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => onRowChange({ ...row, [key]: e.target.value })}
      onKeyDown={handleKeyDown}
      onBlur={() => onClose(true)}
      // Explicit surface colors so the editor matches the cell it sits
      // in regardless of the grid library's own theme variables.
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        padding: '0 0.4rem',
        background: '#ffffff',
        color: 'var(--text, #0f172a)',
        font: 'inherit',
        outline: 'none',
      }}
    />
  );
}

// Column widths are percentages of the grid (min 760px via CSS, so
// narrow screens scroll horizontally instead of crushing columns) —
// no JS measurement, no remount on resize.
const CODE_COLUMNS: Array<{ key: keyof ToothData; name: string; width: string }> = [
  { key: 'mobility',    name: 'Mobility',    width: '8%' },
  { key: 'recession',   name: 'Recession',   width: '9%' },
  { key: 'pocket',      name: 'Pocket',      width: '8%' },
  { key: 'furcation',   name: 'Furcation',   width: '10%' },
  { key: 'hyperplasia', name: 'Hyperplasia', width: '12%' },
  { key: 'calculus',    name: 'Calculus',    width: '9%' },
  { key: 'gingivitis',  name: 'Gingivitis',  width: '11%' },
  { key: 'pdstate',     name: 'PD State',    width: '12%' },
];

export const DentalGrid: React.FC<DentalGridProps> = ({
  toothData,
  onToothDataChange,
  toothMarks,
  onToggleMissing,
  highlightTriadan,
  priorToothData,
  priorGoneTeeth,
}) => {
  const gridRef = useRef<DataGridHandle>(null);
  const rowCountRef = useRef(toothData.length);
  rowCountRef.current = toothData.length;
  const wiring = React.useMemo<EditorWiring>(() => ({ gridRef, rowCountRef }), []);

  // Whole-mouth scoring (calculus, gingivitis, …): one value applied to
  // every chartable tooth from the column header. Refs keep the handler
  // identity stable so the memoized columns survive edits.
  const toothDataRef = useRef(toothData);
  toothDataRef.current = toothData;
  const toothMarksRef = useRef(toothMarks);
  toothMarksRef.current = toothMarks;
  const setAllForColumn = React.useCallback((key: keyof ToothData, name: string) => {
    const input = window.prompt(
      `Set ${name} for every tooth (teeth marked missing are skipped).\nLeave empty and press OK to clear the column:`
    );
    if (input === null) return;
    const value = input.trim();
    onToothDataChange(
      toothDataRef.current.map((t) =>
        toothMarksRef.current[t.triadan] === 'missing' ? t : { ...t, [key]: value }
      )
    );
  }, [onToothDataChange]);

  // Gloved fingers on tablets need taller touch targets than a mouse.
  const coarsePointer = React.useMemo(
    () => window.matchMedia?.('(pointer: coarse)').matches ?? false,
    []
  );

  const columns = React.useMemo((): readonly Column<ToothData>[] => [
    {
      key: 'missing',
      name: 'Missing',
      width: '6%',
      renderCell: ({ row }) => {
        const isMissing = toothMarks[row.triadan] === 'missing';
        const carried = isMissing && !!priorGoneTeeth?.has(row.triadan);
        return (
          <label className="dental-grid__missing-hit">
            <input
              type="checkbox"
              className="dental-grid__missing-check"
              checked={isMissing}
              onChange={() => onToggleMissing(row.triadan)}
              aria-label={`Tooth ${row.triadan} missing${carried ? ' (carried from the previous visit)' : ''}`}
              title={
                carried
                  ? `Tooth ${row.triadan} was already missing or extracted at the previous visit — carried forward automatically`
                  : isMissing
                  ? `Unmark tooth ${row.triadan} as missing`
                  : `Mark tooth ${row.triadan} as missing — crosses out this row and fills the tooth on the Diagnosis diagram`
              }
            />
            {carried && (
              <span className="dental-grid__prior-chip" aria-hidden="true">
                prev
              </span>
            )}
          </label>
        );
      },
    },
    {
      key: 'tooth',
      name: 'Tooth',
      width: '7%',
      // Deciduous rows store lowercase labels (i1, c, p2 — standard
      // notation), but read better capitalized in the on-screen grid.
      renderCell: ({ row }) => <>{(row.tooth ?? '').toUpperCase()}</>,
    },
    { key: 'triadan', name: 'Triadan', width: '8%' },
    ...CODE_COLUMNS.map(({ key, name, width }): Column<ToothData> => ({
      key,
      name,
      width,
      renderEditCell: CodeCellEditor,
      renderCell: ({ row }) => {
        const value = typeof row[key] === 'string' ? (row[key] as string) : '';
        const prior = priorToothData?.[row.triadan]?.[key];
        const priorValue = typeof prior === 'string' ? prior.trim() : '';
        if (value) {
          // Entered — surface the previous visit's value for comparison
          // when it differs (probing-depth trends at a glance).
          return priorValue && priorValue !== value
            ? <span title={`Last visit: ${priorValue}`}>{value}</span>
            : <>{value}</>;
        }
        return priorValue ? (
          <span className="dental-grid__prior-hint" title={`Last visit: ${priorValue} — shown for reference, not carried forward`}>
            {priorValue}
          </span>
        ) : null;
      },
      renderHeaderCell: () => (
        <span className="dental-grid__head">
          {name}
          <button
            type="button"
            className="dental-grid__set-all"
            onClick={() => setAllForColumn(key, name)}
            title={`Set ${name} for every tooth at once`}
            aria-label={`Set ${name} for every tooth at once`}
          >
            ⋯
          </button>
        </span>
      ),
    })),
  ], [toothMarks, onToggleMissing, setAllForColumn, priorToothData, priorGoneTeeth]);

  return (
    <div className="dental-grid-section">
      <div className="dental-grid__section-header">
        <h2 className="dental-grid__title">Dental Chart</h2>
      </div>
      <div className="dental-grid">
        <EditorWiringContext.Provider value={wiring}>
          <DataGrid
            ref={gridRef}
            // Pin the light theme: react-data-grid's stylesheet otherwise
            // switches its internal vars to a dark palette when the OS is
            // in dark mode, turning the cell editor into a black box.
            className="rdg-light"
            columns={columns}
            rows={toothData}
            rowHeight={coarsePointer ? 44 : 35}
            onRowsChange={onToothDataChange}
            rowKeyGetter={(row: ToothData) => row.triadan}
            // Single click puts an editable cell straight into edit mode —
            // one tap per measurement chairside, no double-click dance.
            // Non-editable columns just select (setActivePosition(true)
            // is a plain focus when the column has no editor).
            onCellClick={(args) => args.setActivePosition(true)}
            // 42 rows at most — the page scrolls, the grid doesn't, so
            // virtualization would only fight the sticky-header layout.
            enableVirtualization={false}
            rowClass={(row: ToothData) =>
              [
                toothMarks[row.triadan] === 'missing' ? 'dental-grid__row--missing' : '',
                row.triadan === highlightTriadan ? 'dental-grid__row--ai' : '',
              ].filter(Boolean).join(' ') || undefined
            }
          />
        </EditorWiringContext.Provider>
      </div>
    </div>
  );
};
