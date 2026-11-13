import { render, screen } from '@testing-library/react';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import { WhatsNewModal } from './WhatsNewModal';

beforeAll(installPseudoLocale);
afterAll(restoreLocale);

test("the What's new announcement is fully translated", () => {
  render(<WhatsNewModal onClose={() => {}} />);
  expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
  expect(findUntranslated(document.body)).toEqual([]);
});
