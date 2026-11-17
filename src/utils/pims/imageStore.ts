import { supabase } from '../supabaseClient';
import { createDraftBackend } from './drafts';
import { validSavedImage, type ImageStore } from './images';

export function createImageStore(client: NonNullable<typeof supabase>): ImageStore {
  const drafts = createDraftBackend(client);
  const columns = 'id,chart_id,path,caption,kind,original_path';
  return {
    context: async (chartId) => {
      const { source } = await drafts.context(chartId);
      return { chart_id: source.chart_id, hash: source.hash, patient_name: source.patient_name, patient_number: source.patient_number };
    },
    list: async (chartId) => {
      const { data, error } = await client.from('attachments').select(columns).eq('chart_id', chartId).order('id').limit(31);
      if (error || !data || data.length > 30 || data.some((image) => !validSavedImage(image, chartId))) throw { code: 'unknown' };
      return data;
    },
    read: async (chartId, imageId) => {
      const { data, error } = await client.from('attachments').select(columns).eq('chart_id', chartId).eq('id', imageId).maybeSingle();
      if (error) throw { code: 'unknown' };
      return data && validSavedImage(data, chartId) ? data : null;
    },
    download: async (path) => {
      const { data, error } = await client.storage.from('attachments').download(path);
      if (error || !data) throw { code: 'forbidden' };
      return data;
    },
  };
}
export const defaultImageStore = supabase ? createImageStore(supabase) : null;
