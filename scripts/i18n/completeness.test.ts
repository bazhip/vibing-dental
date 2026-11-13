// @vitest-environment node
import { loadCatalogs, loadMeta } from './catalog';
import { checkCatalogs } from './check';

test('real catalogs are complete, fresh and consistent', () => {
  expect(checkCatalogs(loadCatalogs('src/locales'), loadMeta('src/locales'))).toEqual([]);
});
