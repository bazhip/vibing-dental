import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { findUntranslated, installPseudoLocale, restoreLocale } from '../i18n/testing/pseudo';
import { VisitChoiceField } from './VisitChoiceField';

beforeAll(() => installPseudoLocale());
afterAll(() => restoreLocale());

it('translates the blank dropdown, searchable checklist, and no-matches message', () => {
  const options = ['Email', 'Phone'];
  const { container, rerender } = render(
    <VisitChoiceField id="channel" type="dropdown" options={options} value="" onChange={vi.fn()} />,
  );
  expect(findUntranslated(container, options)).toEqual([]);
  rerender(<VisitChoiceField id="channel" type="multiselectDropdown" options={options} value="" onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Choose options/ }));
  const search = screen.getByRole('searchbox', { name: /Search options/ });
  expect(findUntranslated(container, options)).toEqual([]);
  fireEvent.change(search, { target: { value: 'in person' } });
  expect(screen.getByRole('status')).toHaveTextContent(/No matching options/);
  expect(findUntranslated(container, options)).toEqual([]);
  rerender(<VisitChoiceField id="channel" type="multiselectDropdown" options={options} value={'Email\nPhone'} onChange={vi.fn()} />);
  expect(screen.getByRole('button', { name: /2 selected/ })).toBeVisible();
  expect(findUntranslated(container, options)).toEqual([]);
});
