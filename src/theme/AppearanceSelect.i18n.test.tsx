import { fireEvent, render, screen } from '@testing-library/react';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import { AppearanceSelect } from './AppearanceSelect';
import { getAppearance } from './appearance';

beforeEach(installPseudoLocale);
afterEach(restoreLocale);

test('appearance options and accessible labels are translated, including compact mode', () => {
  const { container } = render(<><AppearanceSelect /><AppearanceSelect compact /></>);
  expect(findUntranslated(container)).toEqual([]);
  const selects = screen.getAllByRole('combobox');
  expect(selects[0]).toHaveAccessibleName(/⟦/);
  expect(selects[1]).toHaveAccessibleName(/⟦/);
  fireEvent.change(selects[0], { target: { value: 'dark' } });
  expect(getAppearance()).toBe('dark');
  expect(selects[1]).toHaveValue('dark');
});

test('the secondary disclosure reveals its translated control only when opened', () => {
  const { container } = render(<AppearanceSelect disclosure />);
  expect(screen.getByRole('combobox')).not.toBeVisible();
  const details = container.querySelector('details')!;
  details.open = true;
  expect(screen.getByRole('combobox')).toHaveAccessibleName(/⟦/);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'light' } });
  expect(container.querySelector('summary')).toHaveTextContent('⟦Light⟧');
  expect(findUntranslated(container)).toEqual([]);
});
