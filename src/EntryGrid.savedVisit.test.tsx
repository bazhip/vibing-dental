import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import EntryGrid from './EntryGrid';
import { DialogHost } from './components/ui/dialogs';

// Pretend a cloud account opened an older saved visit: cloud sync on and
// the chart flagged as opened from the library (no network involved).
vi.mock('./hooks/useCloudSync', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./hooks/useCloudSync')>();
  return {
    ...mod,
    useCloudSync: (...args: Parameters<typeof mod.useCloudSync>) => ({ ...mod.useCloudSync(...args), enabled: true }),
  };
});
vi.mock('./hooks/useChartState', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./hooks/useChartState')>();
  // Dated in the past so it isn't today's (always-editable) visit.
  return {
    ...mod,
    useChartState: () => {
      const s = mod.useChartState();
      return { ...s, openedExisting: true, patientInfo: { ...s.patientInfo, date: '2024-01-02' } };
    },
  };
});

beforeAll(() => {
  window.ResizeObserver = window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia ?? ((q: string) => ({
    matches: false, media: q, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/#/chart/patient');
});
afterEach(() => vi.restoreAllMocks);

const sectionBar = () => document.querySelector('.mobile-section-menu') as HTMLElement;
const unlocked = () => Object.keys(window.sessionStorage).some((k) => k.startsWith('chart.unlocked.') && window.sessionStorage.getItem(k) === '1');
const snapshotSaved = () => Object.keys(window.sessionStorage).some((k) => k.startsWith('chart.unlockSnapshot.'));

it('a view-only saved visit shows a View only pill and an Edit button in the phone section bar', async () => {
  render(<><EntryGrid trial /><DialogHost /></>);
  await screen.findByText('Viewing a saved visit');
  const bar = within(sectionBar());
  expect(bar.getByText('View only')).toBeInTheDocument();
  expect(bar.getByRole('button', { name: /^edit/i })).toBeInTheDocument();
});

it('Edit in the section bar unlocks the chart exactly like the banner’s Edit chart', async () => {
  render(<><EntryGrid trial /><DialogHost /></>);
  await screen.findByText('Viewing a saved visit');
  fireEvent.click(within(sectionBar()).getByRole('button', { name: /^edit/i }));
  await waitFor(() => expect(screen.queryByText('Viewing a saved visit')).toBeNull());
  expect(unlocked()).toBe(true);
  expect(snapshotSaved()).toBe(true);
  expect(within(sectionBar()).queryByText('View only')).toBeNull();
  expect(sectionBar().querySelector('.mobile-section-menu__trailing')).toBeNull();
});

it('the banner’s Edit chart does the same (shared handler)', async () => {
  render(<><EntryGrid trial /><DialogHost /></>);
  await screen.findByText('Viewing a saved visit');
  fireEvent.click(screen.getByRole('button', { name: 'Edit chart' }));
  await waitFor(() => expect(screen.queryByText('Viewing a saved visit')).toBeNull());
  expect(unlocked()).toBe(true);
  expect(snapshotSaved()).toBe(true);
  expect(within(sectionBar()).queryByText('View only')).toBeNull();
});
