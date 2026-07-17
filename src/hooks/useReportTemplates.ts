import React from 'react';
import { supabase, cloudEnabled } from '../utils/supabaseClient';

/**
 * Per-user treatment/surgery report templates — pre-written free-text
 * reports for common procedures (a practice accumulates a couple dozen),
 * insertable from the Treatment Report section. Stored in the
 * `report_templates` table, RLS-scoped to the signed-in user.
 *
 * The full list loads once (it's small) and CRUD calls update local
 * state after the database write succeeds. Standalone mode (no
 * Supabase) reports `enabled: false` and the UI hides the feature.
 */

export interface ReportTemplate {
  id: string;
  name: string;
  body: string;
}

export interface UseReportTemplatesReturn {
  enabled: boolean;
  loaded: boolean;
  templates: ReportTemplate[];
  create: (name: string, body: string) => Promise<ReportTemplate>;
  update: (id: string, name: string, body: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const byName = (a: ReportTemplate, b: ReportTemplate) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function useReportTemplates(): UseReportTemplatesReturn {
  const [templates, setTemplates] = React.useState<ReportTemplate[]>([]);
  const [loaded, setLoaded] = React.useState(!cloudEnabled);

  React.useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('report_templates')
        .select('id, name, body')
        .order('name');
      if (cancelled) return;
      if (!error && data) setTemplates(data as ReportTemplate[]);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const create = React.useCallback(async (name: string, body: string): Promise<ReportTemplate> => {
    if (!supabase) throw new Error('Cloud is not configured.');
    const { data, error } = await supabase
      .from('report_templates')
      .insert({ name, body })
      .select('id, name, body')
      .single();
    if (error) throw new Error(error.message);
    const created = data as ReportTemplate;
    setTemplates((prev) => [...prev, created].sort(byName));
    return created;
  }, []);

  const update = React.useCallback(async (id: string, name: string, body: string): Promise<void> => {
    if (!supabase) throw new Error('Cloud is not configured.');
    const { error } = await supabase
      .from('report_templates')
      .update({ name, body })
      .eq('id', id);
    if (error) throw new Error(error.message);
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name, body } : t)).sort(byName)
    );
  }, []);

  const remove = React.useCallback(async (id: string): Promise<void> => {
    if (!supabase) throw new Error('Cloud is not configured.');
    const { error } = await supabase.from('report_templates').delete().eq('id', id);
    if (error) throw new Error(error.message);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { enabled: cloudEnabled, loaded, templates, create, update, remove };
}
