import React from 'react';
import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChartsMenu } from './ChartsMenu';

test('Patients ▾ holds the library plus this patient\'s New visit and Version history', () => {
  const onOpenLibrary = vi.fn(), onNewVisit = vi.fn(), onHistory = vi.fn();
  render(<ChartsMenu onOpenLibrary={onOpenLibrary} thisPatient={{ name: 'Fluffy', onNewVisit, onHistory }} />);
  const trigger = screen.getByRole('button', { name: /Patients/ });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  expect(screen.getByText('Fluffy')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /New visit/ }));
  expect(onNewVisit).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /Version history/ })).toBeNull(); // closed after choosing

  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: /Version history/ }));
  expect(onHistory).toHaveBeenCalled();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: /View patients/ }));
  expect(onOpenLibrary).toHaveBeenCalled();
});

test('an unsaved chart only offers the library; Esc closes the menu', () => {
  render(<ChartsMenu onOpenLibrary={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /Patients/ }));
  expect(screen.queryByRole('button', { name: /New visit/ })).toBeNull();
  expect(screen.getByRole('button', { name: /View patients/ })).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('button', { name: /View patients/ })).toBeNull();
});

test('visit actions contain only actions for the current patient', () => {
  render(<ChartsMenu visitOnly onOpenLibrary={vi.fn()} thisPatient={{ name: 'Bella', onNewVisit: vi.fn(), onHistory: vi.fn() }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Visit actions' }));
  expect(screen.getByRole('button', { name: /New visit/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /View patients/ })).toBeNull();
});
