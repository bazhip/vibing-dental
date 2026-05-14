import React, { useState, useEffect, useRef } from 'react';
import DataGrid, {
  Column,
  EditorProps,
  DataGridHandle,
} from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { ToothData } from '../types';
import { CodeField } from './CodeField';

interface DentalGridProps {
  toothData: ToothData[];
  onToothDataChange: (rows: ToothData[]) => void;
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

      // Editable columns span idx 2 (mobility) … 9 (pdstate). Tab wraps
      // forward to the next row's first editable column; Shift+Tab wraps
      // back to the previous row's last editable column. Off-page edges
      // are no-ops so focus stays in the grid.
      const FIRST_EDITABLE = 2;
      const LAST_EDITABLE = 9;

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

      return (
        <CodeField
          autoFocus
          value={value}
          onChange={(next) => p.onRowChange({ ...p.row, [key]: next })}
          onKeyDown={handleKeyDown}
          onBlur={() => p.onClose(true)}
          style={{ width: '100%', height: '100%', border: 'none', padding: '8px' }}
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
    { key: 'tooth',   name: 'Tooth',   width: getColumnWidth(0.07), editable: false },
    { key: 'triadan', name: 'Triadan', width: getColumnWidth(0.08), editable: false },
    codeCol('mobility',    'Mobility',    0.09, 2),
    codeCol('recession',   'Recession',   0.10, 3),
    codeCol('pocket',      'Pocket',      0.09, 4),
    codeCol('furcation',   'Furcation',   0.10, 5),
    codeCol('hyperplasia', 'Hyperplasia', 0.13, 6),
    codeCol('calculus',    'Calculus',    0.10, 7),
    codeCol('gingivitis',  'Gingivitis',  0.11, 8),
    codeCol('pdstate',     'PD State',    0.10, 9),
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
            columns={columns}
            rows={toothData}
            onRowsChange={onToothDataChange}
            rowKeyGetter={(row: ToothData) => row.triadan}
          />
        )}
      </div>
    </div>
  );
};
