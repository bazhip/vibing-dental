import React, { useState, useEffect, useRef } from 'react';
import DataGrid from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { ToothData } from '../types';
import { GRID_MIN_HEIGHT } from '../constants';

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

  // Update container width on mount and resize
  useEffect(() => {
    const updateWidth = () => {
      if (gridRef.current) {
        setContainerWidth(gridRef.current.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
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
      editor: (p: any) => (
        <input
          autoFocus
          value={p.row[p.column.key] || ''}
          onChange={(e) => p.onRowChange({ ...p.row, [p.column.key]: e.target.value })}
          onBlur={() => p.onClose(true, false)}
          style={{ width: '100%', height: '100%', border: 'none', padding: '8px' }}
        />
      )
    },
    {
      key: 'recession',
      name: 'Recession',
      width: getColumnWidth(0.10),
      editable: true,
      editor: (p: any) => (
        <input
          autoFocus
          value={p.row[p.column.key] || ''}
          onChange={(e) => p.onRowChange({ ...p.row, [p.column.key]: e.target.value })}
          onBlur={() => p.onClose(true, false)}
          style={{ width: '100%', height: '100%', border: 'none', padding: '8px' }}
        />
      )
    },
    {
      key: 'pocket',
      name: 'Pocket',
      width: getColumnWidth(0.09),
      editable: true,
      editor: (p: any) => (
        <input
          autoFocus
          value={p.row[p.column.key] || ''}
          onChange={(e) => p.onRowChange({ ...p.row, [p.column.key]: e.target.value })}
          onBlur={() => p.onClose(true, false)}
          style={{ width: '100%', height: '100%', border: 'none', padding: '8px' }}
        />
      )
    },
    {
      key: 'furcation',
      name: 'Furcation',
      width: getColumnWidth(0.10),
      editable: true,
      editor: (p: any) => (
        <input
          autoFocus
          value={p.row[p.column.key] || ''}
          onChange={(e) => p.onRowChange({ ...p.row, [p.column.key]: e.target.value })}
          onBlur={() => p.onClose(true, false)}
          style={{ width: '100%', height: '100%', border: 'none', padding: '8px' }}
        />
      )
    },
    {
      key: 'hyperplasia',
      name: 'Hyperplasia',
      width: getColumnWidth(0.13),
      editable: true,
      editor: (p: any) => (
        <input
          autoFocus
          value={p.row[p.column.key] || ''}
          onChange={(e) => p.onRowChange({ ...p.row, [p.column.key]: e.target.value })}
          onBlur={() => p.onClose(true, false)}
          style={{ width: '100%', height: '100%', border: 'none', padding: '8px' }}
        />
      )
    },
    {
      key: 'calculus',
      name: 'Calculus',
      width: getColumnWidth(0.10),
      editable: true,
      editor: (p: any) => (
        <input
          autoFocus
          value={p.row[p.column.key] || ''}
          onChange={(e) => p.onRowChange({ ...p.row, [p.column.key]: e.target.value })}
          onBlur={() => p.onClose(true, false)}
          style={{ width: '100%', height: '100%', border: 'none', padding: '8px' }}
        />
      )
    },
    {
      key: 'gingivitis',
      name: 'Gingivitis',
      width: getColumnWidth(0.11),
      editable: true,
      editor: (p: any) => (
        <input
          autoFocus
          value={p.row[p.column.key] || ''}
          onChange={(e) => p.onRowChange({ ...p.row, [p.column.key]: e.target.value })}
          onBlur={() => p.onClose(true, false)}
          style={{ width: '100%', height: '100%', border: 'none', padding: '8px' }}
        />
      )
    },
    {
      key: 'pdstate',
      name: 'PD State',
      width: getColumnWidth(0.10),
      editable: true,
      editor: (p: any) => (
        <input
          autoFocus
          value={p.row[p.column.key] || ''}
          onChange={(e) => p.onRowChange({ ...p.row, [p.column.key]: e.target.value })}
          onBlur={() => p.onClose(true, false)}
          style={{ width: '100%', height: '100%', border: 'none', padding: '8px' }}
        />
      )
    },
  ];

  return (
    <div className="dental-grid-section">
      <h2 className="dental-grid__title">Dental Chart</h2>
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
