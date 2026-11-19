// @vitest-environment node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import catalog from '../locales/en/help.json';
import { HELP_SCREENSHOTS, HELP_SECTIONS, HELP_TOPICS, RELATED_HELP, helpRoute } from './topics';

it('registers every guide in navigation and gives each section a direct link', () => {
  expect(new Set(HELP_TOPICS)).toEqual(new Set(Object.keys(catalog.articles)));
  expect(HELP_TOPICS).toHaveLength(new Set(HELP_TOPICS).size);
  expect(JSON.stringify(catalog)).not.toMatch(/\b(?:iOS|iPhone|iPad|administrator|PIMS)\b/i);
  for (const topic of HELP_TOPICS) {
    expect(Object.keys(catalog.articles[topic].sections)).toEqual(HELP_SECTIONS);
    for (const section of HELP_SECTIONS) expect(helpRoute(`#${topic}/${section}`)).toEqual({ topic, section });
    for (const related of RELATED_HELP[topic]) expect(HELP_TOPICS).toContain(related);
  }
});

it('ships screenshots for most user guides', () => {
  expect(Object.keys(HELP_SCREENSHOTS).length).toBeGreaterThan(HELP_TOPICS.length / 2);
  for (const { src } of Object.values(HELP_SCREENSHOTS).flat()) {
    expect(existsSync(resolve('public', src.slice(1))), src).toBe(true);
  }
});
