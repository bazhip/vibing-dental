import React from 'react';
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
  // Configure columns for react-data-grid v7
  const columns: any[] = [
    {
      key: 'tooth',
      name: 'Tooth',
      width: '8%',
      minWidth: 80,
      frozen: true,
      editable: false
    },
    {
      key: 'triadan',
      name: 'Triadan',
      width: '10%',
      minWidth: 90,
      frozen: true,
      editable: false
    },
    {
      key: 'mobility',
      name: 'Mobility',
      width: '10%',
      minWidth: 100,
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
      width: '10%',
      minWidth: 100,
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
      width: '10%',
      minWidth: 90,
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
      width: '11%',
      minWidth: 110,
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
      width: '13%',
      minWidth: 120,
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
      width: '10%',
      minWidth: 100,
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
      width: '11%',
      minWidth: 110,
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
      width: '10%',
      minWidth: 100,
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
      <div className="dental-grid">
        <DataGrid
          columns={columns}
          rows={toothData}
          onRowsChange={onToothDataChange}
          rowKeyGetter={(row: ToothData) => row.triadan}
        />
      </div>
    </div>
  );
};
