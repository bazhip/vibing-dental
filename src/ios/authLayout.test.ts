/** Sign-in on iPad: the column is centred on screen, not pinned to the top. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('app sign-in layout', () => {
  it('centres the sign-in column vertically at regular width', () => {
    const css = readFileSync('src/ios/sheets.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/@media \(min-width: 768px\) \{\s*html\.native-ios \.login-container--app \{ align-items: safe center; \}/);
  });
});
