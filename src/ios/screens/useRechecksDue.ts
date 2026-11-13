import React from 'react';
import type { AppLibrary } from '../appData';
import { duePatients, todayIso } from '../../components/chartLibraryData';

/**
 * The Rechecks tab badge: how many patients are Overdue or Due today (the
 * Rechecks tab's two sections, from the same due query). Refetches when
 * the library changes (libraryVersion). 0 without saved charts or on a
 * failed fetch (no badge).
 */
export function useRechecksDue(library: AppLibrary | null): number {
  const [count, setCount] = React.useState(0);
  const listCharts = library?.listCharts;
  const version = library?.libraryVersion ?? 0;
  React.useEffect(() => {
    if (!listCharts) {
      setCount(0);
      return undefined;
    }
    let cancelled = false;
    listCharts({ dueOnly: true, sortKey: 'recall', sortDir: 'asc', limit: 500 })
      .then((page) => { if (!cancelled) setCount(duePatients(page.rows, todayIso()).length); })
      .catch(() => { /* keep the last count */ });
    return () => { cancelled = true; };
  }, [listCharts, version]);
  return count;
}
