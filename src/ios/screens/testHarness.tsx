import React from 'react';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { AppShell, type AppTab } from '../AppShell';
import { AppDataProvider, type AppLibrary, type AppSettings } from '../appData';
import { DialogHost } from '../../components/ui/dialogs';
import type { ChartListQuery, CloudChartMeta } from '../../hooks/useCloudSync';
import { PatientsScreen } from './PatientsScreen';
import { RechecksScreen } from './RechecksScreen';

/** Test-only: a saved-chart row. */
export const meta = (over: Partial<CloudChartMeta> & { id: string }): CloudChartMeta => ({
  patient_name: 'Bella', patient_number: '11', owner_name: '', owner_phone: '', owner_email: '',
  species: 'canine', dentition: 'permanent', chart_date: '2026-11-12', recall_date: '',
  updated_at: '2026-11-12T12:00:00Z', created_by: 'u1', ...over,
});

/** A fake library whose listCharts applies the query like the server. */
export function fakeLibrary(rows: CloudChartMeta[], today = '2026-11-13', over: Partial<AppLibrary> = {}) {
  const listCharts = vi.fn(async (q: ChartListQuery = {}) => {
    const s = q.search?.toLowerCase();
    const out = rows.filter((r) =>
      (!s || [r.patient_name, r.patient_number, r.owner_name, r.owner_phone].some((v) => v.toLowerCase().includes(s))) &&
      (!q.species || r.species.startsWith(q.species)) &&
      (!q.createdBy || r.created_by === q.createdBy) &&
      (!q.dueOnly || (!!r.recall_date && r.recall_date <= today))
    );
    return { rows: out, hasMore: false };
  });
  const library: AppLibrary = {
    listCharts,
    libraryVersion: 0,
    deleteChart: vi.fn(async () => {}),
    newVisit: vi.fn(async () => true),
    newPatient: vi.fn(async () => true),
    loadPdf: vi.fn(async () => true),
    sendReminder: vi.fn(),
    clearRecalls: vi.fn(async () => {}),
    openHistory: vi.fn(),
    openChartId: '',
    ...over,
  };
  return library;
}

const SETTINGS = {} as AppSettings;

export function renderShell(library: AppLibrary | null, activeTab: AppTab) {
  const onOpenChart = vi.fn(async () => true);
  const onTabChange = vi.fn();
  const tree = (lib: AppLibrary | null, tab: AppTab) => (
    <>
      <AppDataProvider library={lib} settings={SETTINGS}>
        <AppShell
          activeTab={tab}
          onTabChange={onTabChange}
          onOpenChart={onOpenChart}
          chart={<p>Chart body</p>}
          patients={<PatientsScreen />}
          rechecks={<RechecksScreen />}
          settings={<p>Settings body</p>}
        />
      </AppDataProvider>
      <DialogHost />
    </>
  );
  const utils = render(tree(library, activeTab));
  return {
    ...utils,
    onOpenChart,
    onTabChange,
    rerenderWith: (lib: AppLibrary | null, tab: AppTab = activeTab) => utils.rerender(tree(lib, tab)),
  };
}

export const panel = (tab: AppTab) => document.querySelector<HTMLElement>(`[data-app-tab="${tab}"]`)!;
