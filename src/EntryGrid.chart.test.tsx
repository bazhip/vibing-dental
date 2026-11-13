import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The Chart tab of the iOS app (trial, no cloud): navigation bar, section
// title menu, Share / More, dictation placement — and the website's
// chart page unchanged.
const flags = vi.hoisted(() => ({ native: false }));
vi.mock('./native/platform', () => ({
  isNativeApp: () => flags.native,
  WEB_ORIGIN: 'https://toothops.app/',
  initNativeShell: () => {},
}));
vi.mock('./native/haptics', () => ({ hapticSelection: vi.fn(), hapticTap: vi.fn(), hapticImpact: vi.fn(), hapticSuccess: vi.fn() }));

// This jsdom build has no Web Storage.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  };
}
vi.stubGlobal('localStorage', memoryStorage());
vi.stubGlobal('sessionStorage', memoryStorage());

import EntryGrid from './EntryGrid';
import { DialogHost } from './components/ui/dialogs';

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
afterEach(() => {
  flags.native = false;
  localStorage.clear();
});

async function renderGrid() {
  window.history.replaceState(null, '', '/#/chart/patient');
  const utils = render(<><EntryGrid trial /><DialogHost /></>);
  await screen.findAllByText('Diagnosis');
  return utils;
}
const chartPanel = () => document.querySelector<HTMLElement>('[data-app-tab="chart"]')!;
const visibleSection = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.sidebar-layout__panel')).find((p) => p.style.display !== 'none')?.dataset.sectionId;

describe('Chart tab in the iOS app', () => {
  it('has a navigation bar: "New chart" until there is a name, then the patient name; trial status as subtitle', async () => {
    flags.native = true;
    await renderGrid();
    const bar = chartPanel().querySelector<HTMLElement>('.ios-navbar')!;
    expect(bar).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: /New chart/ })).toBeInTheDocument();
    expect(within(chartPanel()).getAllByText('On this device only').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText('Enter patient name'), { target: { value: 'Biscuit' } });
    expect(screen.getByRole('heading', { level: 1, name: /Biscuit/ })).toBeInTheDocument();
  });

  it('the title menu jumps to a section', async () => {
    flags.native = true;
    await renderGrid();
    expect(visibleSection()).toBe('patient');
    fireEvent.click(within(chartPanel()).getAllByRole('button', { name: /New chart/ })[0]);
    act(() => fireEvent.click(screen.getByRole('menuitemradio', { name: 'Exam' })));
    expect(visibleSection()).toBe('exam');
  });

  it('Share replaces the floating PDF button and opens Documents', async () => {
    flags.native = true;
    const { container } = await renderGrid();
    expect(container.querySelector('.fab-download')).toBeNull();
    const share = within(chartPanel()).getByRole('button', { name: 'Preview and download the chart PDF' });
    expect(share).toHaveAttribute('form', 'chart-form');
  });

  it('More holds Customize for the current section (opens chart settings for it)', async () => {
    flags.native = true;
    await renderGrid();
    fireEvent.click(within(chartPanel()).getByRole('button', { name: 'More' }));
    act(() => fireEvent.click(screen.getByRole('menuitem', { name: 'Customize Patient' })));
    expect(await screen.findByRole('dialog', { name: /Chart settings/i })).toBeInTheDocument();
  });

  it('More is always there (Chart settings) — also on sections without Customize', async () => {
    flags.native = true;
    await renderGrid();
    fireEvent.click(within(chartPanel()).getAllByRole('button', { name: /New chart/ })[0]);
    act(() => fireEvent.click(screen.getByRole('menuitemradio', { name: 'Exam' })));
    fireEvent.click(within(chartPanel()).getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('menuitem', { name: /^Customize/ })).toBeNull();
    act(() => fireEvent.click(screen.getByRole('menuitem', { name: 'Chart settings' })));
    expect(await screen.findByRole('dialog', { name: /Chart settings/i })).toBeInTheDocument();
  });

  it('no Customize buttons in the section headers (they are in More)', async () => {
    flags.native = true;
    await renderGrid();
    expect(within(chartPanel()).queryByRole('button', { name: 'Customize' })).toBeNull();
  });

  it('no text glyphs in the chart chrome', async () => {
    flags.native = true;
    await renderGrid();
    const bar = chartPanel().querySelector<HTMLElement>('.ios-navbar')!;
    expect(bar.textContent).not.toMatch(/[⤓↶↷✕☰▾×]/);
  });
});

describe('Chart page on the website (unchanged)', () => {
  it('keeps the topbar save pill, PDF button with its glyph, and no iOS navigation bar', async () => {
    flags.native = false;
    const { container } = await renderGrid();
    expect(container.querySelector('.ios-navbar')).toBeNull();
    expect(container.querySelector('.ios-chart-notice')).toBeNull();
    expect(container.querySelector('.entry-grid__topbar .save-status')?.textContent).toBe('On this device only');
    expect(container.querySelector('.fab-download')?.textContent).toBe('⤓ Preview PDF');
    // Section-header Customize stays on the website.
    expect(screen.getAllByRole('button', { name: 'Customize' }).length).toBeGreaterThan(0);
  });
});
