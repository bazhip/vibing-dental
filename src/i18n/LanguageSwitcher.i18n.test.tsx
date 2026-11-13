import { render } from '@testing-library/react';
import { installPseudoLocale, restoreLocale, findUntranslated } from './testing/pseudo';
import { LANGUAGE_NAMES } from './config';
import { LanguageSwitcher } from './LanguageSwitcher';

// Each language is named in itself (endonyms), never translated.
const ENDONYMS = Object.values(LANGUAGE_NAMES);

beforeEach(installPseudoLocale);
afterEach(restoreLocale);

test('the language switcher, labelled and compact', () => {
  const { container, unmount } = render(<LanguageSwitcher />);
  expect(container.textContent).toContain('⟦');
  expect(findUntranslated(container, ENDONYMS)).toEqual([]);
  unmount();
  const compact = render(<LanguageSwitcher compact />);
  expect(compact.container.querySelector('[aria-label^="⟦"]')).not.toBeNull();
  expect(findUntranslated(compact.container, ENDONYMS)).toEqual([]);
});
