import { isExtensionPage } from './extensionPage';

describe('isExtensionPage', () => {
  it('only for chrome-extension: pages', () => {
    expect(isExtensionPage()).toBe(false);
    expect(isExtensionPage('chrome-extension:')).toBe(true);
    expect(isExtensionPage('https:')).toBe(false);
  });
});
