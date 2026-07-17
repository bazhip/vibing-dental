import React, { useState, useEffect, useRef } from 'react';
import DataGrid, {
  Column,
  EditorProps,
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
}

/**
 * Data grid component for dental chart entry. Click any editable cell
 * to start typing; Excel-style key behavior throughout:
 *
 *   - Tab / Shift+Tab   commit and move to the next / previous cell
 *   - Enter             commit and move to the same column in the next row
 *   - Escape            cancel and discard the edit
 *
 * The grid ref exposes `selectCell(position, enableEditor)`, which is
 * how we drive the Enter-advances-row behavior — the cell editor commits
 * via `onClose(true)`, then we explicitly select the row below.
 *
 * Enter is also blocked from bubbling to the enclosing <form>, which
 * would otherwise submit and open the PDF preview modal.
 */
export const DentalGrid: React.FC<DentalGridProps> = ({
  toothData,
  onToothDataChange,
  toothMarks,
  onToggleMissing,
}) => {
  const [containerWidth, setContainerWidth] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<DataGridHandle>(null);

  // Watch the wrapper with ResizeObserver — that way we measure correctly
  // both at mount and when the grid becomes visible after a `display: none`
  // toggle (e.g. when its containing tab is activated). A plain mount-time
  // offsetWidth read returns 0 while the panel is hidden, which is why the
  // grid was rendering blank inside the Charting tab.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.offsetWidth;
      if (w > 0) setContainerWidth(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const getColumnWidth = (percentage: number) => {
    return containerWidth > 0 ? Math.floor(containerWidth * percentage) : 100;
  };

  // ----- Cell editor ------------------------------------------------------
  // Defined inside the component so it closes over `toothData` and
  // `gridRef` — needed for Enter-to-advance.
  const makeCodeCellEditor = React.useCallback(
    (column: { key: string; idx: number }) => (p: EditorProps<ToothData>) => {
      const key = p.column.key as keyof ToothData;
      const current = p.row[key];
      const value = typeof current === 'string' ? current : '';

      const rowIdx = toothData.findIndex((r) => r.triadan === p.row.triadan);
      const lastRowIdx = toothData.length - 1;

      // Editable columns span idx 3 (mobility) … 10 (pdstate). Tab wraps
      // forward to the next row's first editable column; Shift+Tab wraps
      // back to the previous row's last editable column. Off-page edges
      // are no-ops so focus stays in the grid.
      const FIRST_EDITABLE = 3;
      const LAST_EDITABLE = 10;

      const advance = (
        nextRow: number,
        nextIdx: number,
        enableEditor: boolean
      ) => {
        if (nextRow < 0 || nextRow > lastRowIdx) return;
        queueMicrotask(() => {
          gridRef.current?.selectCell({ rowIdx: nextRow, idx: nextIdx }, enableEditor);
        });
      };

      const handleKeyDown: React.KeyboardEventHandler = (e) => {
        if (e.key === 'Tab') {
          // Drive Tab navigation explicitly — the beta build of RDG
          // doesn't catch Tab from inside our editor reliably, so the
          // browser was letting Tab leave the grid entirely.
          e.preventDefault();
          e.stopPropagation();
          p.onClose(true);
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
        if (e.key === 'Enter') {
          // Commit, then move down a row in the same column. Block the
          // event from bubbling to the form (which would submit).
          e.preventDefault();
          e.stopPropagation();
          p.onClose(true);
          advance(rowIdx + 1, column.idx, false);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          p.onClose(false);
          return;
        }
      };

      // Plain input — measurements here are numeric grades (mobility,
      // pocket depths, PD stage), so the dental-code autocomplete that
      // CodeField provides elsewhere would only get in the way.
      return (
        <input
          autoFocus
          value={value}
          onChange={(e) => p.onRowChange({ ...p.row, [key]: e.target.value })}
          onKeyDown={handleKeyDown}
          onBlur={() => p.onClose(true)}
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
    },
    [toothData]
  );

  // ----- Columns ----------------------------------------------------------
  // Column index passed through to the editor so Enter-to-row-below stays
  // on the same column even if columns get reordered later.
  const codeCol = (
    key: keyof ToothData,
    name: string,
    widthPct: number,
    idx: number
  ): Column<ToothData> => ({
    key: key as string,
    name,
    width: getColumnWidth(widthPct),
    editable: true,
    editor: makeCodeCellEditor({ key: key as string, idx }),
  });

  const columns: Column<ToothData>[] = [
    {
      key: 'missing',
      name: 'Missing',
      width: getColumnWidth(0.08),
      editable: false,
      formatter: ({ row }) => {
        const isMissing = toothMarks[row.triadan] === 'missing';
        return (
          <button
            type="button"
            className={`dental-grid__missing-btn${
              isMissing ? ' dental-grid__missing-btn--active' : ''
            }`}
            aria-pressed={isMissing}
            title={
              isMissing
                ? `Unmark tooth ${row.triadan} as missing`
                : `Mark tooth ${row.triadan} as missing — crosses out this row and fills the tooth on the Diagnosis diagram`
            }
            onClick={() => onToggleMissing(row.triadan)}
          >
            {isMissing ? 'Missing ✕' : 'Missing'}
          </button>
        );
      },
    },
    {
      key: 'tooth',
      name: 'Tooth',
      width: getColumnWidth(0.07),
      editable: false,
      // Deciduous rows store lowercase labels (i1, c, p2 — standard
      // notation), but read better capitalized in the on-screen grid.
      formatter: ({ row }) => <>{(row.tooth ?? '').toUpperCase()}</>,
    },
    { key: 'triadan', name: 'Triadan', width: getColumnWidth(0.08), editable: false },
    codeCol('mobility',    'Mobility',    0.08, 3),
    codeCol('recession',   'Recession',   0.09, 4),
    codeCol('pocket',      'Pocket',      0.08, 5),
    codeCol('furcation',   'Furcation',   0.10, 6),
    codeCol('hyperplasia', 'Hyperplasia', 0.11, 7),
    codeCol('calculus',    'Calculus',    0.09, 8),
    codeCol('gingivitis',  'Gingivitis',  0.10, 9),
    codeCol('pdstate',     'PD State',    0.09, 10),
  ];

  return (
    <div className="dental-grid-section">
      <div className="dental-grid__section-header">
        <span className="dental-grid__title">Dental Chart</span>
      </div>
      <div className="dental-grid" ref={wrapperRef}>
        {containerWidth > 0 && (
          <DataGrid
            ref={gridRef}
            key={containerWidth}
            // Pin the light theme: react-data-grid's stylesheet otherwise
            // switches its internal vars to a dark palette when the OS is
            // in dark mode, turning the cell editor into a black box.
            className="rdg-light"
            columns={columns}
            rows={toothData}
            onRowsChange={onToothDataChange}
            rowKeyGetter={(row: ToothData) => row.triadan}
            rowClass={(row: ToothData) =>
              toothMarks[row.triadan] === 'missing'
                ? 'dental-grid__row--missing'
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
};
