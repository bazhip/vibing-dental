import { supabase } from './supabaseClient';
import { LocalizedError } from './apiErrors';
import i18n from '../i18n';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from '../types';
import { getInitialToothData } from '../constants';
import { localDateISO } from './localDate';
import type { ChartWorkspace } from '../hooks/useCloudSync';

const pending = new Map<string, number>();
export function beginImageUpload(id: string): () => void {
  pending.set(id, (pending.get(id) ?? 0) + 1);
  return () => { const n = (pending.get(id) ?? 1) - 1; if (n) pending.set(id, n); else pending.delete(id); };
}
export const hasPendingImageUpload = (id: string): boolean => (pending.get(id) ?? 0) > 0;

export async function hasChartImages(id: string): Promise<boolean> {
  if (hasPendingImageUpload(id)) return true;
  if (!supabase) return false;
  const { data, error } = await supabase.from('attachments').select('id').eq('chart_id', id).limit(1);
  if (error) throw new LocalizedError(i18n.t('animalTabs.imageCheckFailed', { ns: 'app' }));
  return !!data?.length;
}

/** Only this user's recent uploads; no signed URLs or other patients' data. */
export async function findImageDrafts(): Promise<Array<{ id: string; date: string }>> {
  if (!supabase) return [];
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user.id;
  if (!uid) return [];
  const { data, error } = await supabase.from('attachments').select('chart_id, created_at')
    .eq('created_by', uid).order('created_at', { ascending: false }).limit(200);
  if (error || !data?.length) return [];
  const dates = new Map<string, string>();
  for (const row of data) if (!dates.has(row.chart_id)) dates.set(row.chart_id, row.created_at);
  const { data: saved, error: chartError } = await supabase.from('charts').select('id').in('id', [...dates.keys()]);
  if (chartError) return []; // A failed lookup must never turn a saved chart into a blank draft.
  for (const row of saved ?? []) dates.delete(row.id);
  return [...dates].map(([id, date]) => ({ id, date: localDateISO(new Date(date)) }));
}

/** An image-only recovery never inherits another patient's identity or findings. */
export function imageDraftWorkspace(id: string, date: string): ChartWorkspace {
  return {
    id, openedExisting: false, savedHash: '', lastSaved: { chartId: '', at: '' },
    saveError: '', dirty: true, duplicateAnswered: '', skipDuplicate: '',
    snapshot: {
      species: 'canine', logo: 'vca', toothData: getInitialToothData('canine'),
      patientInfo: { patientName: '', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '', doctor: '', tech: '', date,
        complaint: '', treatmentReport: '', recallDate: '', nerveBlocks: structuredClone(EMPTY_NERVE_BLOCKS), exam: structuredClone(EMPTY_EXAM_FINDINGS) },
      preMarks: {}, preComments: [], preStrokes: [], postMarks: {}, postComments: [], postStrokes: [],
    },
  };
}

/** Discard is explicit, and only safe while no saved chart owns these files. */
export async function discardImageDraft(id: string): Promise<void> {
  if (!supabase || hasPendingImageUpload(id)) throw new LocalizedError(i18n.t('animalTabs.imageCheckFailed', { ns: 'app' }));
  const { data, error } = await supabase.from('charts').select('id').eq('id', id).maybeSingle();
  if (error) throw new LocalizedError(i18n.t('animalTabs.imageCheckFailed', { ns: 'app' }));
  if (data) throw new LocalizedError(i18n.t('animalTabs.draftAlreadySaved', { ns: 'app' }));
  const { removeChartAttachments } = await import('./chartAttachments');
  await removeChartAttachments(supabase, id);
}
