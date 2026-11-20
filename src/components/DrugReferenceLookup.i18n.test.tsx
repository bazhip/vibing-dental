import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import { DrugReferenceLookup } from './DrugReferenceLookup';

const calls = vi.hoisted(() => ({ search: vi.fn(), label: vi.fn() }));
vi.mock('../utils/dailyMed', async real => ({
  ...await real<typeof import('../utils/dailyMed')>(),
  findDailyMedProducts: calls.search,
  loadDailyMedLabel: calls.label,
}));
beforeAll(() => installPseudoLocale());
afterAll(() => restoreLocale());

it('keeps name selection local until Search and opens the exact source label', async () => {
  calls.search.mockResolvedValueOnce([{ id: '879f0b28-00c0-40e8-b224-afcf39b1fce7', title: 'Fixture tablets' }]);
  calls.label.mockResolvedValueOnce({ strengths: ['Fixture ingredient 25 mg'], sections: [{ title: 'Source section', text: null }] });
  const { container } = render(<DrugReferenceLookup selectedName="Fixture ingredient" />);
  fireEvent.click(screen.getByText(/Look up a drug/));
  fireEvent.click(screen.getByRole('button', { name: /Use selected name/ }));
  expect(calls.search).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Search labels/ }));
  expect(calls.search).toHaveBeenCalledExactlyOnceWith('Fixture ingredient', expect.any(AbortSignal));
  fireEvent.click(await screen.findByRole('button', { name: 'Fixture tablets' }));
  const link = screen.getByRole('link', { name: /Open full label/ });
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(link).toHaveAttribute('href', 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=879f0b28-00c0-40e8-b224-afcf39b1fce7');
  fireEvent.click(await screen.findByText('Source section'));
  expect(await screen.findByText(/full layout and context/)).toBeVisible();
  expect(findUntranslated(container, ['Fixture tablets', 'Fixture ingredient 25 mg', 'Source section'])).toEqual([]);
});
