import { act, render, screen } from '@testing-library/react';
import { vi, it, expect } from 'vitest';
import { AnimalTabs } from './AnimalTabs';
import type { AnimalTab } from '../hooks/useAnimalTabs';
const tabs = ['a','b'].map(id => ({ id, key: id, name: id, patientNumber: '1001', date: '2026-11-17', owner: '', species: 'canine' })) as AnimalTab[];
it('reveals the full selected tab after the tab strip is resized', () => {
  let resize: ResizeObserverCallback;
  vi.stubGlobal('ResizeObserver', class { constructor(cb: ResizeObserverCallback) { resize = cb; } observe() {} disconnect() {} });
  const { container } = render(<AnimalTabs tabs={tabs} activeId="b" busy={false} onAdd={() => {}} onClose={() => {}} onSelect={() => {}} />);
  const list = screen.getByRole('tablist');
  const selected = container.querySelector('.animal-tabs__item--active')!;
  Object.defineProperties(list, { clientWidth: { value: 200 }, scrollWidth: { value: 500 } });
  vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 300 } as DOMRect);
  vi.spyOn(selected, 'getBoundingClientRect').mockReturnValue({ left: 250, right: 450 } as DOMRect);
  act(() => resize!([], {} as ResizeObserver));
  expect(list.scrollLeft).toBeGreaterThanOrEqual(150);
  expect(list.style.getPropertyValue('--animal-tab-available')).toBe('200px');
  vi.unstubAllGlobals();
});
