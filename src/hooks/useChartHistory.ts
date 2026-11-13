import React from 'react';
import { supabase } from '../utils/supabaseClient';
import i18n from '../i18n';

/**
 * A chart's history (public.chart_revisions): who saved each version and
 * when. Visibility is enforced by the database (same as the chart). The
 * list loads without the chart data; a version's data loads on demand.
 */

export interface ChartRevision {
  id: number;
  savedBy: string | null;
  /** Display name (doctor name or email), '' when unknown. */
  savedByName: string;
  startedAt: string;
  savedAt: string;
  /** 'baseline' = the chart as it was when history began. */
  note: string;
}

export function useChartHistory(chartId: string, open: boolean) {
  const [revisions, setRevisions] = React.useState<ChartRevision[] | null>(null);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    if (!supabase || !chartId) { setRevisions([]); return; }
    setError('');
    const { data, error: err } = await supabase
      .from('chart_revisions')
      .select('id, saved_by, started_at, saved_at, note')
      .eq('chart_id', chartId)
      .order('saved_at', { ascending: false })
      .limit(200);
    if (err) {
      setError(/relation .*chart_revisions|does not exist/i.test(err.message)
        ? i18n.t('sync.historyNotSetUp', { ns: 'app' })
        : err.message);
      setRevisions([]);
      return;
    }
    const rows = (data ?? []) as Array<{ id: number; saved_by: string | null; started_at: string; saved_at: string; note: string }>;
    const ids = Array.from(new Set(rows.map((r) => r.saved_by).filter((x): x is string => !!x)));
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: nameRows } = await supabase.rpc('history_display_names', { ids });
      for (const n of (nameRows ?? []) as Array<{ id: string; name: string }>) names.set(n.id, n.name ?? '');
    }
    setRevisions(rows.map((r) => ({
      id: r.id,
      savedBy: r.saved_by,
      savedByName: r.saved_by ? names.get(r.saved_by) ?? '' : '',
      startedAt: r.started_at,
      savedAt: r.saved_at,
      note: r.note ?? '',
    })));
  }, [chartId]);

  React.useEffect(() => { if (open) void load(); }, [open, load]);

  const loadData = React.useCallback(async (revisionId: number): Promise<unknown> => {
    if (!supabase) throw new Error(i18n.t('sync.cloudNotConfigured', { ns: 'app' }));
    const { data, error: err } = await supabase.from('chart_revisions').select('data').eq('id', revisionId).single();
    if (err) throw new Error(err.message);
    return (data as { data: unknown }).data;
  }, []);

  return { revisions, error, reload: load, loadData };
}
