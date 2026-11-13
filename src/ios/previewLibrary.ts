/* DEV-only sample library for the iOS preview: `?iosPreview=1&iosFixtures=1`
 * on the dev server gives the trial (which has no saved charts) a fixed set
 * of patients so the Patients and Rechecks tabs can be seen and
 * screenshotted. EntryGrid calls this only under `import.meta.env.DEV`, so
 * production builds drop it. Actions only log. Not user-facing text. */
import type { AppLibrary } from './appData';
import type { ChartListQuery, CloudChartMeta } from '../hooks/useCloudSync';
import { localDateISO } from '../utils/localDate';
import { isIosPreview } from './preview';

function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return localDateISO(d);
}

function sample(): CloudChartMeta[] {
  const row = (
    id: string, name: string, num: string, owner: string, email: string, species: string,
    chartDays: number, recallDays: number | null,
  ): CloudChartMeta => ({
    id, patient_name: name, patient_number: num, owner_name: owner, owner_phone: '', owner_email: email,
    species, dentition: 'permanent', chart_date: daysFromToday(chartDays),
    recall_date: recallDays === null ? '' : daysFromToday(recallDays),
    updated_at: `${daysFromToday(chartDays)}T15:30:00Z`, created_by: 'preview',
  });
  return [
    row('p1', 'Bella', '1042', 'Ann Turner', 'ann@example.com', 'canine', -1, -12),
    row('p2', 'Max', '2210', 'Sam Okafor', '', 'feline', -3, 0),
    row('p3', 'Max', '2210', 'Sam Okafor', '', 'feline', -95, null),
    row('p4', 'Luna', '3307', 'Priya Shah', 'priya@example.com', 'feline', -6, -2),
    row('p5', 'Charlie', '4415', 'Tom Meyer', 'tom@example.com', 'canine', -10, 0),
    row('p6', 'Coco', '', 'Jo Lee', '', 'canine', -20, 30),
    row('p7', 'Milo', '5520', 'Ana Ruiz', 'ana@example.com', 'canine', -40, null),
    row('p8', 'Milo', '5520', 'Ana Ruiz', 'ana@example.com', 'canine', -200, null),
    row('p9', 'Mittens', '6631', 'Kai Brown', '', 'feline', -60, 14),
  ];
}

let cached: AppLibrary | null = null;

/** The sample library when the preview asks for it and there's no real one. */
export function previewLibrary(real: AppLibrary | null): AppLibrary | null {
  if (!import.meta.env.DEV || real || !isIosPreview()) return real;
  if (new URLSearchParams(window.location.search).get('iosFixtures') !== '1') return real;
  if (cached) return cached;
  const rows = sample();
  const today = localDateISO();
  const log = (...args: unknown[]) => console.info('[iosFixtures]', ...args);
  cached = {
    listCharts: async (q: ChartListQuery = {}) => {
      const s = q.search?.trim().toLowerCase();
      let out = rows.filter((r) =>
        (!s || [r.patient_name, r.patient_number, r.owner_name].some((v) => v.toLowerCase().includes(s))) &&
        (!q.species || r.species === q.species) &&
        (!q.dueOnly || (!!r.recall_date && r.recall_date <= today))
      );
      out = [...out].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return { rows: out.slice(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? 200)), hasMore: false };
    },
    libraryVersion: 0,
    deleteChart: async (id) => log('deleteChart', id),
    newVisit: async (id) => { log('newVisit', id); return false; },
    newPatient: async () => { log('newPatient'); return false; },
    loadPdf: async (f) => { log('loadPdf', f.name); return false; },
    sendReminder: (c) => log('sendReminder', c.id),
    clearRecalls: async (ids) => log('clearRecalls', ids),
    openHistory: (id, label) => log('openHistory', id, label),
    openChartId: '',
  };
  return cached;
}
