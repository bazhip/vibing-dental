import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from '../i18n';
import { LocalizedError } from '../utils/apiErrors';
import { EMPTY_PRACTICE_CHART_FIELDS, parsePracticeChartFieldConfig, type PracticeChartFieldConfig } from '../utils/practiceChartFields';
import { supabase } from '../utils/supabaseClient';

const TABLE = 'practice_chart_field_libraries';

type FieldState =
  | { practiceId: string; loadKey: number; status: 'ready'; config: PracticeChartFieldConfig; revision: string | null }
  | { practiceId: string; loadKey: number; status: 'error' };

export function usePracticeChartFields(practiceId: string) {
  const [state, setState] = useState<FieldState>();
  const [reloadKey, setReloadKey] = useState(0);
  const scope = useRef({ practiceId, reloadKey });
  scope.current = { practiceId, reloadKey };
  const current = state?.practiceId === practiceId ? state : undefined;

  useEffect(() => {
    const database = supabase;
    if (!practiceId || !database) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await database.from(TABLE).select('config, revision').eq('practice_id', practiceId).maybeSingle();
        if (cancelled) return;
        const config = data ? parsePracticeChartFieldConfig(data.config) : EMPTY_PRACTICE_CHART_FIELDS;
        if (error || !config) setState({ practiceId, loadKey: reloadKey, status: 'error' });
        else setState({ practiceId, loadKey: reloadKey, status: 'ready', config, revision: data?.revision ?? null });
      } catch {
        if (!cancelled) setState({ practiceId, loadKey: reloadKey, status: 'error' });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [practiceId, reloadKey]);

  const reload = useCallback(() => {
    setReloadKey(key => key + 1);
  }, []);

  const save = async (draft: PracticeChartFieldConfig) => {
    const config = parsePracticeChartFieldConfig(draft);
    const conflict = () => new LocalizedError(i18n.t('visitDocumentation:practiceChartFields.conflict'));
    if (!supabase || !practiceId || scope.current.practiceId !== practiceId || current?.status !== 'ready'
      || current.loadKey !== scope.current.reloadKey || !config) throw conflict();

    const revision = crypto.randomUUID();
    const row = { config, revision };
    const request = current.revision
      ? supabase.from(TABLE).update(row).eq('practice_id', practiceId).eq('revision', current.revision)
      : supabase.from(TABLE).insert({ ...row, practice_id: practiceId });
    const { data, error } = await request.select('revision').maybeSingle();
    if (scope.current.practiceId !== practiceId || error?.code === '23505' || (!error && !data)) throw conflict();
    if (error) throw new LocalizedError(i18n.t('visitDocumentation:practiceChartFields.saveFailed'));

    if (scope.current.reloadKey === reloadKey) {
      setState({ practiceId, loadKey: reloadKey, status: 'ready', config, revision });
    } else {
      // A refresh begun before this write can have fetched the preceding revision.
      reload();
    }
  };

  return {
    config: current?.status === 'ready' ? current.config : EMPTY_PRACTICE_CHART_FIELDS,
    status: practiceId && supabase ? (current?.loadKey === reloadKey ? current.status : 'loading') : 'ready',
    resolved: !!current || !practiceId || !supabase,
    save,
    reload,
  } as const;
}
