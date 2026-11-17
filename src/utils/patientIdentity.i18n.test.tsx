import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DialogHost, chooseDialog } from '../components/ui/dialogs';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import { patientIdentityQuestion } from './patientIdentity';

beforeEach(installPseudoLocale);
afterEach(restoreLocale);

it('translates the identity warning, missing-identity label, and actions', async () => {
  render(<DialogHost />);
  let answer!: Promise<string | null>;
  act(() => {
    answer = chooseDialog(patientIdentityQuestion(
      { patient_name: 'Luffy', patient_number: 'SP0001' },
      { patient_name: '', patient_number: '' },
    ));
  });
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  expect(findUntranslated(document.body)).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: /⟦Cancel⟧/ }));
  await expect(answer).resolves.toBeNull();
});
