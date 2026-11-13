// @vitest-environment node
import fs from 'node:fs';
import { chunkWorthSending, invalidReason, normalizeTranscript } from '../../src/utils/aiAutofill';
import { clinicalKey, fixtureTranscriptPath, loadFixture, readUtterances, VOICE_LANGS } from './voiceEval';

// Offline checks of the per-language voice fixtures (scripts/fixtures/voice).
// The live scoring against Claude is `npm run replay -- --all-langs --expect`.

const multiset = (keys: string[]) => [...keys].sort();

describe.each(VOICE_LANGS)('voice fixture %s', (lng) => {
  const fixture = loadFixture(lng);
  const utterances = readUtterances(fs.readFileSync(fixtureTranscriptPath(lng), 'utf8'));

  it('is a full dictation whose lines match expected.json', () => {
    expect(fixture.lng).toBe(lng);
    expect(utterances.length).toBeGreaterThanOrEqual(25);
    expect(fixture.lines.map((l) => l.heard)).toEqual(utterances);
  });

  it('normalizeTranscript gives the expected cleaned text on every line', () => {
    for (const line of fixture.lines) expect(normalizeTranscript(line.heard, lng), line.heard).toBe(line.cleaned);
  });

  it('chunkWorthSending keeps every line with a finding', () => {
    for (const line of fixture.lines.filter((l) => l.finding)) expect(chunkWorthSending(line.heard, lng), line.heard).toBe(true);
  });

  it('every expected action is valid', () => {
    for (const a of fixture.actions) expect(invalidReason(a), JSON.stringify(a)).toBeNull();
  });

  it('has a tech speaker, side talk and filler that are not findings', () => {
    expect(fixture.lines.some((l) => l.heard.startsWith('Speaker 1:'))).toBe(true);
    expect(fixture.lines.some((l) => !chunkWorthSending(l.heard, lng))).toBe(true);
  });
});

it('every language has the same clinical content as English', () => {
  const en = multiset(loadFixture('en').actions.map(clinicalKey));
  for (const lng of VOICE_LANGS) expect(multiset(loadFixture(lng).actions.map(clinicalKey)), lng).toEqual(en);
});

it('every language agrees on the structured values (doses, grid values, codes)', () => {
  // Free text (exam comment, treatment report) may differ; everything else is identical.
  const strip = (lng: (typeof VOICE_LANGS)[number]) =>
    loadFixture(lng).actions.map((a) =>
      a.name === 'append_treatment_report' || a.name === 'set_exam_finding'
        ? { name: a.name, input: { ...a.input, text: undefined, comment: undefined } }
        : a,
    );
  for (const lng of VOICE_LANGS) expect(strip(lng), lng).toEqual(strip('en'));
});
