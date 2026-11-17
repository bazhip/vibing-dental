import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ attachments: [{ chart_id: 'lost', created_at: '2026-11-17T12:00:00Z' }, { chart_id: 'saved', created_at: '2026-11-17T12:00:00Z' }], charts: [{ id: 'saved' }], attachmentError: false, chartError: false, queries: [] as unknown[][] }));
vi.mock('./supabaseClient', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'current-user' } } } }) },
  from: (table: string) => {
    let selectedId = '';
    const q = { select: () => q, eq: (key: string, value: string) => { db.queries.push([table, key, value]); if (key === 'id') selectedId = value; return q; }, order: () => q, limit: () => q, in: () => q,
      maybeSingle: async () => ({ data: db.charts.find(row => row.id === selectedId) ?? null, error: db.chartError ? { message: 'offline' } : null }),
      then: (resolve: (value: unknown) => void) => resolve({ data: table === 'attachments' ? db.attachments : db.charts, error: (table === 'attachments' ? db.attachmentError : db.chartError) ? { message: 'offline' } : null }) };
    return q;
  },
} }));
vi.mock('./chartAttachments', () => ({ removeChartAttachments: vi.fn(async () => {}) }));
import { removeChartAttachments } from './chartAttachments';
import { discardImageDraft, beginImageUpload, hasPendingImageUpload, hasChartImages, findImageDrafts, imageDraftWorkspace } from './imageDrafts';
beforeEach(() => { db.attachmentError = false; db.chartError = false; db.queries = []; vi.mocked(removeChartAttachments).mockClear(); });
it('recovers only own uploads without a saved chart', async () => {
  expect(await findImageDrafts()).toEqual([{ id: 'lost', date: '2026-11-17' }]);
  expect(db.queries).toContainEqual(['attachments', 'created_by', 'current-user']);
});
it('never recovers blank charts when the saved-chart lookup fails', async () => {
  db.chartError = true;
  expect(await findImageDrafts()).toEqual([]);
});
it('refuses to claim an empty attachment set when the image lookup fails', async () => {
  db.attachmentError = true;
  await expect(hasChartImages('lost')).rejects.toThrow(/Could not check/);
});
it('tracks overlapping uploads independently by chart', () => {
  const first = beginImageUpload('a'), second = beginImageUpload('a'), other = beginImageUpload('b');
  first(); expect(hasPendingImageUpload('a')).toBe(true);
  second(); expect(hasPendingImageUpload('a')).toBe(false);
  expect(hasPendingImageUpload('b')).toBe(true); other();
});
it('creates recovery workspaces without patient identity or clinical findings', () => {
  const draft = imageDraftWorkspace('lost', '2026-11-17');
  expect(draft.snapshot.patientInfo).toMatchObject({ patientName: '', patientNumber: '', ownerName: '', date: '2026-11-17' });
  expect(draft.snapshot.preMarks).toEqual({});
  expect(draft.openedExisting).toBe(false);
  expect(draft.lastSaved.at).toBe('');
});

it('deletes orphan uploads only after verifying no saved chart exists', async () => {
  await discardImageDraft('lost');
  expect(removeChartAttachments).toHaveBeenCalledWith(expect.anything(), 'lost');
});
it('refuses to delete images belonging to a saved chart', async () => {
  await expect(discardImageDraft('saved')).rejects.toThrow(/saved elsewhere/);
  expect(removeChartAttachments).not.toHaveBeenCalled();
});
it('refuses image deletion if saved-chart verification fails', async () => {
  db.chartError = true;
  await expect(discardImageDraft('lost')).rejects.toThrow(/Could not check/);
  expect(removeChartAttachments).not.toHaveBeenCalled();
});
