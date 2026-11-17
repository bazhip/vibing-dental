import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import i18n from '../i18n';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import { SectionHeader } from './SectionHeader';

beforeAll(() => installPseudoLocale());
afterAll(() => restoreLocale());
it('keeps customization separate from clinical actions and translates its label', () => {
  const customize = vi.fn();
  const { container } = render(<SectionHeader title={i18n.t('exam.title', { ns: 'forms' })} onCustomize={customize} actions={<button>{i18n.t('exam.markAllNormal', { ns: 'forms' })}</button>} />);
  const button = screen.getByRole('button', { name: /Customize/ });
  expect(button.closest('.section-header__actions')).toBeNull();
  expect(screen.getByRole('button', { name: /Mark all normal/ }).closest('.section-header__actions')).not.toBeNull();
  fireEvent.click(button);
  expect(customize).toHaveBeenCalledOnce();
  expect(findUntranslated(container)).toEqual([]);
});
