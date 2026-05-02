import React, { useState, useEffect, useRef } from 'react';
import DataGrid from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { ToothData } from '../types';
import { CodeField } from './CodeField';

const codeCellEditor = (p: any) => (
  <CodeField
    autoFocus
    value={p.row[p.column.key] || ''}
    onChange={(value) => p.onRowChange({ ...p.row, [p.column.key]: value })}
    onBlur={() => p.onClose(true, false)}
    style={{ width: '100%', height: '100%', border: 'none', padding: '8px' }}
  />
);

interface DentalGridProps {
  toothData: ToothData[];
  onToothDataChange: (rows: ToothData[]) => void;
}

/**
 * Data grid component for dental chart entry
 * Click any editable cell to start typing
 */
export const DentalGrid: React.FC<DentalGridProps> = ({
  toothData,
  onToothDataChange,
}) => {
  const [containerWidth, setContainerWidth] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  // Watch the wrapper with ResizeObserver — that way we measure correctly
  // both at mount and when the grid becomes visible after a `display: none`
  // toggle (e.g. when its containing tab is activated). A plain mount-time
  // offsetWidth read returns 0 while the panel is hidden, which is why the
  // grid was rendering blank inside the Charting tab.
  useEffect(() => {
    const el = gridRef.current;
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
  // Configure columns for react-data-grid v7
  // Calculate pixel widths based on container to enable dynamic resizing
  const getColumnWidth = (percentage: number) => {
    return containerWidth > 0 ? Math.floor(containerWidth * percentage) : 100;
  };

  const columns: any[] = [
    {
      key: 'tooth',
      name: 'Tooth',
      width: getColumnWidth(0.07),
      editable: false
    },
    {
      key: 'triadan',
      name: 'Triadan',
      width: getColumnWidth(0.08),
      editable: false
    },
    {
      key: 'mobility',
      name: 'Mobility',
      width: getColumnWidth(0.09),
      editable: true,
      editor: codeCellEditor
    },
    {
      key: 'recession',
      name: 'Recession',
      width: getColumnWidth(0.10),
      editable: true,
      editor: codeCellEditor
    },
    {
      key: 'pocket',
      name: 'Pocket',
      width: getColumnWidth(0.09),
      editable: true,
      editor: codeCellEditor
    },
    {
      key: 'furcation',
      name: 'Furcation',
      width: getColumnWidth(0.10),
      editable: true,
      editor: codeCellEditor
    },
    {
      key: 'hyperplasia',
      name: 'Hyperplasia',
      width: getColumnWidth(0.13),
      editable: true,
      editor: codeCellEditor
    },
    {
      key: 'calculus',
      name: 'Calculus',
      width: getColumnWidth(0.10),
      editable: true,
      editor: codeCellEditor
    },
    {
      key: 'gingivitis',
      name: 'Gingivitis',
      width: getColumnWidth(0.11),
      editable: true,
      editor: codeCellEditor
    },
    {
      key: 'pdstate',
      name: 'PD State',
      width: getColumnWidth(0.10),
      editable: true,
      editor: codeCellEditor
    },
  ];

  return (
    <div className="dental-grid-section">
      <div className="dental-grid__section-header">
        <span className="dental-grid__title">Dental Chart</span>
      </div>
      <div className="dental-grid" ref={gridRef}>
        {containerWidth > 0 && (
          <DataGrid
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
