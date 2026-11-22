import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import { PracticeFieldEditor } from './PracticeFieldEditor';

beforeEach(installPseudoLocale);
afterEach(restoreLocale);

it('adds a shared field to the current page and keeps a copy of its configuration', async () => {
  const field = { id: '11111111-1111-4111-8111-111111111111', label: 'Referral source', inputType: 'radio' as const, options: ['Hospital', 'Owner'] };
  const onSave = vi.fn(async () => {});
  const { container } = render(<PracticeFieldEditor page="exam" status="ready" canEdit config={{ fields: [field], pages: {} }}
    onSave={onSave} onReload={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: '⟦Add field⟧' }));
  fireEvent.click(screen.getByRole('button', { name: field.label }));
  const row = screen.getByRole('listitem');
  expect(within(row).getByText(field.label)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '⟦Save fields⟧' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ fields: [field], pages: { exam: [field] } }));
  expect(findUntranslated(container, [field.label])).toEqual([]);
});

it('keeps shared library management available when the page is full', () => {
  const fields = Array.from({ length: 24 }, (_, index) => ({
    id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`, label: `Field ${index + 1}`,
  }));
  render(<PracticeFieldEditor page="exam" status="ready" canEdit config={{ fields, pages: { exam: fields } }}
    onSave={vi.fn()} onReload={() => {}} />);
  expect(screen.getByRole('button', { name: '⟦Add field⟧' })).toBeDisabled();
  const manage = screen.getByRole('button', { name: '⟦Manage shared fields⟧' });
  fireEvent.click(manage);
  expect(manage).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getAllByRole('button', { name: '⟦Delete⟧' })).toHaveLength(24);
});
