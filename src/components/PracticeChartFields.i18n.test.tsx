import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import { PracticeChartFields } from './PracticeChartFields';

beforeEach(installPseudoLocale);
afterEach(restoreLocale);

it('keeps recorded fields visible and uses their saved definitions after the page layout changes', () => {
  const field = { id: '11111111-1111-4111-8111-111111111111', label: 'Recorded field' };
  const { container } = render(<PracticeChartFields fields={[{ ...field, label: 'Renamed field' }]}
    answers={[{ page: 'exam', field, value: 'Existing observation' }]} readOnly onChange={() => {}} />);
  expect(screen.getByRole('textbox', { name: field.label })).toHaveValue('Existing observation');
  expect(screen.getByRole('textbox', { name: field.label })).toHaveAttribute('readonly');
  expect(findUntranslated(container, [field.label, 'Existing observation'])).toEqual([]);
});
