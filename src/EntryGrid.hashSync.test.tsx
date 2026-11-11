import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import EntryGrid from './EntryGrid';
import { DialogHost } from './components/ui/dialogs';

// Layout/diagram code leans on browser APIs jsdom lacks.
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
afterEach(() => vi.restoreAllMocks);

const navButton = (label: string) =>
  screen.getAllByRole('button').find((b) => b.querySelector('.sidebar-layout__nav-label')?.textContent === label)!;

it('a hash change and a different section pick in the same render settle instead of ping-ponging', async () => {
  window.history.replaceState(null, '', '/#/chart/patient');
  render(<><EntryGrid trial /><DialogHost /></>);
  await screen.findAllByText('Diagnosis');
  // Behave like Safari: refuse past 100 calls (jsdom has no limit, so
  // without this the old ping-pong just spins forever).
  const real = window.history.replaceState.bind(window.history);
  let calls = 0;
  const spy = vi.spyOn(window.history, 'replaceState').mockImplementation((...args) => {
    if (++calls > 100) throw new DOMException('Attempt to use history.replaceState() more than 100 times per 10 seconds', 'SecurityError');
    return real(...args);
  });

  // One task: the address moves to Charting (as Back/Forward would) and
  // the user picks Diagnosis — React commits both in one render.
  act(() => {
    window.history.replaceState(null, '', '/#/chart/charting');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    navButton('Diagnosis').click();
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });

  // Before the fix this looped until the browser refused (100+ calls).
  expect(spy.mock.calls.length).toBeLessThan(5);
  // And the address and the section on screen agree.
  const section = window.location.hash.split('/').pop();
  const active = document.querySelector('.sidebar-layout__nav-item--active .sidebar-layout__nav-label')?.textContent?.toLowerCase();
  expect(active).toBe(section);
});

it('picking a section writes it to the address', async () => {
  window.history.replaceState(null, '', '/#/chart/patient');
  render(<><EntryGrid trial /><DialogHost /></>);
  await screen.findAllByText('Exam');
  act(() => navButton('Exam').click());
  await waitFor(() => expect(window.location.hash).toBe('#/chart/exam'));
});
