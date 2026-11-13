import i18n from './index';
test('renders English common strings', () => {
  expect(i18n.t('common:actions.save')).toBe('Save');
  expect(i18n.t('common:actions.cancel')).toBe('Cancel');
});
test('falls back to English, never a raw key', async () => {
  i18n.addResource('en', 'common', 'test.onlyInEnglish', 'English only');
  await i18n.changeLanguage('fr');
  expect(i18n.t('common:test.onlyInEnglish' as any)).toBe('English only');
  await i18n.changeLanguage('en');
});
test('French catalog loads', async () => {
  expect(i18n.getFixedT('fr', 'common')('actions.save')).toBe('Enregistrer');
});
test('the image limit pluralizes on count', () => {
  expect(i18n.getFixedT('en', 'chart')('imaging.limitReached', { count: 30 })).toBe('This chart has reached its 30-image limit.');
  expect(i18n.getFixedT('fr', 'chart')('imaging.limitReached', { count: 1 })).toBe('Ce dossier a atteint sa limite de 1 image.');
  expect(i18n.getFixedT('fr', 'chart')('imaging.limitReached', { count: 100 })).toBe('Ce dossier a atteint sa limite de 100 images.');
});
