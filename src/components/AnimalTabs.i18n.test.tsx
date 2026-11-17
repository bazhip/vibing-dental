import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AnimalTabs } from './AnimalTabs';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';

afterEach(async () => { cleanup(); await restoreLocale(); });
const tabs = [
  { id: 'a', key: 'a', name: 'Luna', owner: 'Sarah', patientNumber: '1042', date: '2026-11-16', species: 'canine' as const },
  { id: 'b', key: 'b', name: 'Oliver', owner: 'James', patientNumber: '1087', date: '2026-11-12', species: 'feline' as const },
];
it('selects, closes, and opens animals with keyboard-accessible controls', () => {
  const select = vi.fn(), close = vi.fn(), add = vi.fn();
  render(<AnimalTabs tabs={tabs} activeId="a" busy={false} onSelect={select} onClose={close} onAdd={add} />);
  fireEvent.click(screen.getByRole('tab', { name: /Oliver/ }));
  expect(select).toHaveBeenCalledWith('b');
  fireEvent.keyDown(screen.getByRole('tab', { name: /Luna/ }), { key: 'ArrowRight' });
  expect(select).toHaveBeenLastCalledWith('b');
  fireEvent.click(screen.getByRole('button', { name: 'Close Luna tab' }));
  expect(close).toHaveBeenCalledWith('a');
  fireEvent.click(screen.getByRole('button', { name: 'Open another animal' }));
  expect(add).toHaveBeenCalledOnce();
});
it('translates tab labels, fallback names, and the empty workspace', async () => {
  await installPseudoLocale();
  const props = { activeId: '', busy: false, onSelect: vi.fn(), onClose: vi.fn(), onAdd: vi.fn() };
  const { container, rerender } = render(<AnimalTabs {...props} tabs={[{ ...tabs[0], name: '', owner: '', patientNumber: '', date: '' }]} />);
  expect(findUntranslated(container)).toEqual([]);
  rerender(<AnimalTabs {...props} tabs={[]} />);
  expect(findUntranslated(container)).toEqual([]);
});

it('moves keyboard focus to the remaining animal, then to plus after the last close', () => {
  function Workspace() {
    const [open, setOpen] = React.useState(tabs);
    return <AnimalTabs tabs={open} activeId={open[0]?.id ?? ''} busy={false} onSelect={vi.fn()} onAdd={vi.fn()}
      onClose={id => setOpen(previous => previous.filter(tab => tab.id !== id))} />;
  }
  render(<Workspace />);
  screen.getByRole('button', { name: 'Close Luna tab' }).focus();
  fireEvent.click(screen.getByRole('button', { name: 'Close Luna tab' }));
  expect(screen.getByRole('tab', { name: /Oliver/ })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Close Oliver tab' }));
  expect(screen.getByRole('button', { name: 'Open another animal' })).toHaveFocus();
});

it('shows the patient ID and visit date instead of the owner', () => {
  render(<AnimalTabs tabs={tabs} activeId="a" busy={false} onSelect={vi.fn()} onClose={vi.fn()} onAdd={vi.fn()} />);
  const luna = screen.getByRole('tab', { name: /Luna/ });
  expect(luna).toHaveTextContent('1042');
  expect(luna).toHaveTextContent('Nov 16, 2026');
  expect(luna).not.toHaveTextContent('Sarah');
  expect(luna).not.toHaveTextContent('PID');
});
