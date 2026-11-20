import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from '../i18n';
import { LocalizedError } from '../utils/apiErrors';
import { parseExamLayout, type ExamLayoutField } from '../utils/examLayout';
import { supabase } from '../utils/supabaseClient';

type State =
  | { practiceId: string; loadKey: number; status: 'ready'; fields?: ExamLayoutField[]; revision: string | null }
  | { practiceId: string; loadKey: number; status: 'error' };

const table = 'exam_layouts';

export function useExamLayout(practiceId: string) {
  const [state, setState] = useState<State>();
  const [loadKey, setLoadKey] = useState(0);
  const scope = useRef(practiceId);
  scope.current = practiceId;
  const current = state?.practiceId === practiceId ? state : undefined;

  useEffect(() => {
    const database = supabase;
    if (!practiceId || !database) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await database.from(table).select('fields, revision').eq('practice_id', practiceId).maybeSingle();
        if (cancelled) return;
        const fields = data ? parseExamLayout(data.fields) : undefined;
        if (error || (data && !fields)) setState({ practiceId, loadKey, status: 'error' });
        else setState({ practiceId, loadKey, status: 'ready', fields, revision: data?.revision ?? null });
      } catch {
        if (!cancelled) setState({ practiceId, loadKey, status: 'error' });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [practiceId, loadKey]);

  const reload = useCallback(() => setLoadKey(key => key + 1), []);

  const save = async (draft: ExamLayoutField[]) => {
    const fields = parseExamLayout(draft);
    const conflict = () => new LocalizedError(i18n.t('forms:exam.layout.conflict'));
    if (!supabase || !practiceId || scope.current !== practiceId ||
      current?.status !== 'ready' || current.loadKey !== loadKey || !fields) throw conflict();
    const revision = crypto.randomUUID();
    const row = { fields, revision };
    const request = current.revision
      ? supabase.from(table).update(row).eq('practice_id', practiceId).eq('revision', current.revision)
      : supabase.from(table).insert({ ...row, practice_id: practiceId });
    const { data, error } = await request.select('revision').maybeSingle();
    if (scope.current !== practiceId || error?.code === '23505' || (!error && !data)) throw conflict();
    if (error) throw new LocalizedError(i18n.t('forms:exam.layout.saveFailed'));
    setState({ practiceId, loadKey, status: 'ready', fields, revision });
  };

  return {
    fields: current?.status === 'ready' ? current.fields : undefined,
    status: practiceId ? (current?.loadKey === loadKey ? current.status : 'loading') : 'ready',
    reload,
    save,
  } as const;
}
