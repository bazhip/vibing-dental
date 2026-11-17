import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const html = readFileSync(resolve('index.html'), 'utf8');

test('appearance bootstrap is a blocking same-origin script allowed by the deployment CSP', () => {
  expect(html).toContain('<script src="/appearance.js"></script>');
  expect(html.indexOf('/appearance.js')).toBeLessThan(html.indexOf('rel="stylesheet"'));
});

test.each([
  ['dark', false, 'dark'], ['light', true, 'light'], ['system', true, 'dark'],
  ['system', false, 'light'], [null, true, 'dark'], ['invalid', true, 'dark'],
])('first paint resolves %s with OS dark=%s to %s', (saved, systemDark, expected) => {
  const document = { documentElement: { dataset: {} as Record<string, string> } };
  runInNewContext(readFileSync(resolve('public/appearance.js'), 'utf8'), {
    document, localStorage: { getItem: () => saved }, window: { matchMedia: () => ({ matches: systemDark }) },
  });
  expect(document.documentElement.dataset.theme).toBe(expected);
});

test('first paint works when storage and matchMedia are unavailable', () => {
  const document = { documentElement: { dataset: {} as Record<string, string> } };
  runInNewContext(readFileSync(resolve('public/appearance.js'), 'utf8'), {
    document, window: {}, localStorage: { getItem: () => { throw new DOMException('blocked'); } },
  });
  expect(document.documentElement.dataset.theme).toBe('light');
});
