import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The website and the iOS app render EntryGrid from the same code; this
// flips isNativeApp() per test.
const flags = vi.hoisted(() => ({ native: false }));
vi.mock('./native/platform', () => ({
  isNativeApp: () => flags.native,
  WEB_ORIGIN: 'https://toothops.app/',
  initNativeShell: () => {},
}));
vi.mock('./native/haptics', () => ({ hapticSelection: vi.fn(), hapticTap: vi.fn(), hapticImpact: vi.fn(), hapticSuccess: vi.fn() }));

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
});

async function renderGrid() {
  window.history.replaceState(null, '', '/#/chart/patient');
  const utils = render(<><EntryGrid trial /><DialogHost /></>);
  await screen.findAllByText('Diagnosis');
  return utils;
}

describe('EntryGrid on the website', () => {
  it('renders the topbar, section rail, phone section menu, Settings menu and PDF button — no app shell', async () => {
    flags.native = false;
    const { container } = await renderGrid();
    expect(container.querySelector('.entry-grid-container > header.entry-grid__topbar')).not.toBeNull();
    expect(container.querySelector('.sidebar-layout__nav')).not.toBeNull();
    expect(container.querySelector('.mobile-section-menu')).not.toBeNull();
    expect(container.querySelector('.chart-menu__trigger')).not.toBeNull();
    expect(container.querySelector('.sidebar-layout')?.className).toBe('sidebar-layout');
    expect(container.querySelector('.fab-download')).not.toBeNull();
    expect(container.querySelector('.entry-grid__footnote')).not.toBeNull();
    expect(container.querySelector('.ios-appshell')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    // The form is a direct child of the page container, as before.
    expect(container.querySelector('.entry-grid-container > form#chart-form')).not.toBeNull();
  });
});

describe('EntryGrid in the iOS app', () => {
  it('renders the app shell with the chart in the Chart tab, and none of the web chrome', async () => {
    flags.native = true;
    const { container } = await renderGrid();
    expect(container.querySelector('.ios-appshell')).not.toBeNull();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Chart', 'Patients', 'Rechecks', 'Settings']);
    expect(container.querySelector('.entry-grid__topbar')).toBeNull();
    expect(container.querySelector('.sidebar-layout__nav')).toBeNull();
    expect(container.querySelector('.mobile-section-menu')).toBeNull();
    expect(container.querySelector('.chart-menu__trigger')).toBeNull();
    expect(container.querySelector('.entry-grid__footnote')).toBeNull();
    const chartPanel = container.querySelector<HTMLElement>('[data-app-tab="chart"]')!;
    expect(chartPanel.querySelector('form#chart-form')).not.toBeNull();
  });

  it('Settings tab shows the settings list; the chart stays mounted with its edits', async () => {
    flags.native = true;
    const { container } = await renderGrid();
    const chartPanel = container.querySelector<HTMLElement>('[data-app-tab="chart"]')!;
    const name = within(chartPanel).getAllByRole('textbox')[0] as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Biscuit' } });

    act(() => fireEvent.click(screen.getByRole('tab', { name: 'Settings' })));
    const settingsPanel = container.querySelector<HTMLElement>('[data-app-tab="settings"]')!;
    expect(settingsPanel).not.toHaveAttribute('hidden');
    expect(chartPanel).toHaveAttribute('hidden');
    expect(within(settingsPanel).getByRole('button', { name: /Chart settings/ })).toBeInTheDocument();

    act(() => fireEvent.click(screen.getByRole('tab', { name: 'Chart' })));
    expect(chartPanel).not.toHaveAttribute('hidden');
    expect(name.isConnected).toBe(true);
    expect(name.value).toBe('Biscuit');
  });

  it('Chart settings from the Settings tab pushes the native Chart settings screen (no dialog)', async () => {
    flags.native = true;
    const { container } = await renderGrid();
    act(() => fireEvent.click(screen.getByRole('tab', { name: 'Settings' })));
    const settingsPanel = container.querySelector<HTMLElement>('[data-app-tab="settings"]')!;
    act(() => fireEvent.click(within(settingsPanel).getByRole('button', { name: /Chart settings/ })));
    expect(await within(settingsPanel).findByRole('heading', { name: 'Chart settings' })).toBeInTheDocument();
    expect(within(settingsPanel).getAllByRole('switch', { name: 'Mobility' })[0]).toBeChecked();
    expect(screen.queryByRole('dialog', { name: /Chart settings/i })).toBeNull();
  });

  it('a #/library address lands on the Patients tab instead of the My charts dialog', async () => {
    flags.native = true;
    const { container } = await renderGrid();
    act(() => {
      window.history.replaceState(null, '', '/#/library');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(container.querySelector('[data-app-tab="patients"]')).not.toHaveAttribute('hidden');
    expect(screen.getByRole('tab', { name: 'Patients' })).toHaveAttribute('aria-selected', 'true');
  });
});
