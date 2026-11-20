import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import { VisitTypeChooser } from './VisitTypeChooser';

afterEach(() => restoreLocale());

it('starts the selected visit and defaults to the dental procedure', () => {
  const onChoose = vi.fn();
  render(<VisitTypeChooser open onChoose={onChoose} />);
  expect(screen.getByRole('radio', { name: /Dental procedure/ })).toBeChecked();
  fireEvent.click(screen.getByRole('radio', { name: /Consultation/ }));
  expect(onChoose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Start visit' }));
  expect(onChoose).toHaveBeenCalledWith('consultation');
});

it('translates both visit choices and their instructions', async () => {
  await installPseudoLocale();
  render(<VisitTypeChooser open onChoose={vi.fn()} />);
  expect(findUntranslated(screen.getByRole('dialog'))).toEqual([]);
});
