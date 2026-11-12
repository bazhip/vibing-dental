import React from 'react';

/**
 * Column sorting shared by the admin tables. Blank values (null / empty
 * string) always sink to the bottom whichever direction, so "no practice"
 * or "never active" rows never crowd the top of a descending sort.
 */

export type SortDir = 'asc' | 'desc';
export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}
export type SortValue = string | number | null | undefined;

export function sortRows<T, K extends string>(
  rows: readonly T[],
  { key, dir }: SortState<K>,
  value: (row: T, key: K) => SortValue,
  tiebreak: (a: T, b: T) => number = () => 0,
): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  const norm = (v: SortValue) => (v === '' || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? null : v);
  return [...rows].sort((x, y) => {
    const a = norm(value(x, key));
    const b = norm(value(y, key));
    if (a === null && b === null) return tiebreak(x, y);
    if (a === null) return 1;
    if (b === null) return -1;
    const c =
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    return c !== 0 ? c * sign : tiebreak(x, y);
  });
}

/** Parse an ISO/date string to a sortable number (null when blank/bad). */
export const dateValue = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/**
 * Sort state for one table. Clicking the active column flips direction;
 * clicking a new one starts at `descFirst` columns' natural order
 * (numbers and dates read best biggest/newest first, text A→Z).
 */
export function useTableSort<K extends string>(initial: SortState<K>, descFirst: readonly K[] = []) {
  const [sort, setSort] = React.useState<SortState<K>>(initial);
  const toggle = (key: K) =>
    setSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: descFirst.includes(key) ? 'desc' : 'asc' },
    );
  const ariaSort = (key: K): 'ascending' | 'descending' | 'none' =>
    sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return { sort, setSort, toggle, ariaSort };
}

/** The clickable label inside a column header. */
export const SortButton: React.FC<{
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}> = ({ label, active, dir, onClick, className = 'chart-library__sort' }) => (
  <button type="button" className={className} onClick={onClick}>
    {label}
    <span className="chart-library__sort-arrow" aria-hidden="true">
      {active ? (dir === 'asc' ? '▲' : '▼') : ''}
    </span>
  </button>
);
