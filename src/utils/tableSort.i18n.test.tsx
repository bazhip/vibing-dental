import { render } from '@testing-library/react';
import i18n from '../i18n';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import { SortButton } from './tableSort';

beforeEach(installPseudoLocale);
afterEach(restoreLocale);

test('a sort button adds no text of its own to the label it is given', () => {
  for (const dir of ['asc', 'desc'] as const) {
    const { container, unmount } = render(<SortButton label={i18n.t('actions.save')} active dir={dir} onClick={() => {}} />);
    expect(findUntranslated(container)).toEqual([]);
    unmount();
  }
});
