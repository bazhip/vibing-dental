import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from '../i18n';
import { LocalizedError } from '../utils/apiErrors';
import { supabase } from '../utils/supabaseClient';
import { EMPTY_CONSULTATION_LIBRARY, parseConsultationLibrary, type ConsultationLibrary } from '../utils/consultationTemplates';

type LibraryState =
  | { practiceId: string; loadKey: number; status: 'ready'; config: ConsultationLibrary; revision: string | null }
  | { practiceId: string; loadKey: number; status: 'error' };

const TABLE = 'consultation_template_libraries';

export function useConsultationLibrary(practiceId: string) {
  const [state, setState] = useState<LibraryState>();
  const [reloadKey, setReloadKey] = useState(0);
  const scope = useRef(practiceId);
  scope.current = practiceId;
  const current = state?.practiceId === practiceId ? state : undefined;

  useEffect(() => {
    const database = supabase;
    if (!practiceId || !database) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await database.from(TABLE).select('config, revision').eq('practice_id', practiceId).maybeSingle();
        if (cancelled) return;
        const config = data ? parseConsultationLibrary(data.config) : EMPTY_CONSULTATION_LIBRARY;
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

  const save = async (draft: ConsultationLibrary) => {
    const config = parseConsultationLibrary(draft);
    const conflict = () => new LocalizedError(i18n.t('visitDocumentation:consultation.templates.conflict'));
    if (!supabase || !practiceId || scope.current !== practiceId || current?.status !== 'ready' || current.loadKey !== reloadKey || !config) throw conflict();
    const revision = crypto.randomUUID();
    const row = { config, revision };
    const request = current.revision
      ? supabase.from(TABLE).update(row).eq('practice_id', practiceId).eq('revision', current.revision)
      : supabase.from(TABLE).insert({ ...row, practice_id: practiceId });
    const { data, error } = await request.select('revision').maybeSingle();
    if (scope.current !== practiceId) throw conflict();
    if (error?.code === '23505' || (!error && !data)) throw conflict();
    if (error) throw new LocalizedError(i18n.t('visitDocumentation:consultation.templates.saveFailed'));
    setState({ practiceId, loadKey: reloadKey, status: 'ready', config, revision });
  };

  return {
    config: current?.status === 'ready' ? current.config : EMPTY_CONSULTATION_LIBRARY,
    status: practiceId ? (current?.loadKey === reloadKey ? current.status : 'loading') : 'ready',
    resolved: !!current || !practiceId,
    save,
    reload,
  } as const;
}
