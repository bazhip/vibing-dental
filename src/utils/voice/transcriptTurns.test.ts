import { transcriptTurns } from './transcriptTurns';

test('groups consecutive pauses by the same speaker into one turn', () => {
  const r = transcriptTurns(
    ['Speaker 0: One oh one GI two.', 'Speaker 0: One oh two, same thing.', 'Speaker 1: Got it.'],
    '',
  );
  expect(r.multiSpeaker).toBe(true);
  expect(r.turns).toEqual([
    { speaker: 0, text: 'One oh one GI two. One oh two, same thing.', interim: '' },
    { speaker: 1, text: 'Got it.', interim: '' },
  ]);
});

test('splits a segment that changes speaker mid-way', () => {
  const r = transcriptTurns(['Speaker 0: Did you get that? Speaker 1: Yes. Speaker 0: Good.'], '');
  expect(r.turns.map((t) => [t.speaker, t.text])).toEqual([
    [0, 'Did you get that?'],
    [1, 'Yes.'],
    [0, 'Good.'],
  ]);
});

test('unlabelled text continues the current speaker', () => {
  const r = transcriptTurns(['Speaker 0: Ready?', 'Speaker 1: Heart rate ninety', 'and steady.'], '');
  expect(r.turns).toEqual([
    { speaker: 0, text: 'Ready?', interim: '' },
    { speaker: 1, text: 'Heart rate ninety and steady.', interim: '' },
  ]);
});

test('one speaker only: not multi-speaker, one line per pause', () => {
  const r = transcriptTurns(['Speaker 0: 104 fractured.', 'Speaker 0: 209 missing.'], '');
  expect(r.multiSpeaker).toBe(false);
  expect(r.turns.map((t) => t.text)).toEqual(['104 fractured.', '209 missing.']);
});

test('no labels at all (browser speech): one line per pause', () => {
  const r = transcriptTurns(['104 fractured.', '209 missing.'], '');
  expect(r.multiSpeaker).toBe(false);
  expect(r.turns).toEqual([
    { speaker: null, text: '104 fractured.', interim: '' },
    { speaker: null, text: '209 missing.', interim: '' },
  ]);
});

test('interim words join the current turn, or start a new one when the speaker changes', () => {
  expect(transcriptTurns(['Speaker 0: 104'], 'fractured').turns).toEqual([
    { speaker: 0, text: '104', interim: 'fractured' },
  ]);
  const r = transcriptTurns(['Speaker 0: 104 fractured.'], 'Speaker 1: got');
  expect(r.multiSpeaker).toBe(true);
  expect(r.turns).toEqual([
    { speaker: 0, text: '104 fractured.', interim: '' },
    { speaker: 1, text: '', interim: 'got' },
  ]);
  // Nothing final yet: interim alone.
  expect(transcriptTurns([], 'one oh four').turns).toEqual([{ speaker: null, text: '', interim: 'one oh four' }]);
});

test('empty input gives no turns', () => {
  expect(transcriptTurns([], '').turns).toEqual([]);
  expect(transcriptTurns(['  '], '').turns).toEqual([]);
});
