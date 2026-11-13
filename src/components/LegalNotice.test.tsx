import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import i18n, { loadLanguage } from '../i18n';
import { EnglishGoverns } from './LegalNotice';

afterEach(async () => { await i18n.changeLanguage('en'); });

describe('EnglishGoverns', () => {
  test('hidden in English', () => {
    const { container } = render(<EnglishGoverns />);
    expect(container).toBeEmptyDOMElement();
  });

  test('shown in a known non-English language', async () => {
    await loadLanguage('fr');
    await i18n.changeLanguage('fr');
    render(<EnglishGoverns />);
    expect(document.querySelector('.login-legal')).not.toBeNull();
  });

  test('hidden while the language is not resolved yet', async () => {
    const fresh = createInstance();
    await fresh.init({ lng: 'xx', resources: {}, react: { useSuspense: false } });
    expect(fresh.resolvedLanguage).toBeUndefined();
    const { container } = render(<I18nextProvider i18n={fresh}><EnglishGoverns /></I18nextProvider>);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/./)).toBeNull();
  });
});
