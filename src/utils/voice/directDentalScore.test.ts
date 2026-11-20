import { directDentalScore } from './directDentalScore';
import type { ToothData } from '../../types';

const teeth = [{ tooth: 'C', triadan: 104 }] satisfies ToothData[];

describe('direct dental scores', () => {
  it('charts a single explicit score on a tooth present in the chart', () => {
    const text = 'Speaker 0: 104 mobility 2.';
    expect(directDentalScore({ text, annotated: text, receivedAt: 1, highConfidence: true }, teeth, 'en', '')).toEqual({
      name: 'set_tooth_field', input: { triadan: 104, field: 'mobility', value: '2' },
    });
  });

  it.each([
    ['104 mobility 4.', '104 mobility 4.', 'en', ''],
    ['106 mobility 2.', '106 mobility 2.', 'en', ''],
    ['104 mobility 2.', '[?104] mobility 2.', 'en', ''],
    ['104 mobility 2.', undefined, 'en', ''],
    ['104 mobility 2.', '104 mobility 2.', 'fr', ''],
    ['104 mobility 2?', '104 mobility 2?', 'en', ''],
    ['Speaker 1: 104 mobility 2.', 'Speaker 1: 104 mobility 2.', 'en', ''],
    ['104 mobility 2.', '104 mobility 2.', 'en', 'Speaker 1: My turn.'],
    ['104 mobility 2.', '104 mobility 2.', 'en', 'Maybe use'],
    ['104 mobility 2.', '104 mobility 2.', 'en', 'Here is an example.'],
    ['104 mobility 2 then calculus 3.', '104 mobility 2 then calculus 3.', 'en', ''],
  ] as const)('leaves %s to the normal extraction path', (text, annotated, lng, recent) => {
    expect(directDentalScore({ text, annotated, receivedAt: 1, highConfidence: true }, teeth, lng, recent)).toBeNull();
  });

  it('leaves a change to a recorded score for the normal confirmation flow', () => {
    const text = '104 mobility 2.';
    expect(directDentalScore({ text, annotated: text, receivedAt: 1, highConfidence: true },
      [{ ...teeth[0], mobility: '1' }], 'en', '')).toBeNull();
  });
});

it('requires an explicit high-confidence signal from speech recognition', () => {
  const text = '104 mobility 2.';
  expect(directDentalScore({ text, annotated: text, receivedAt: 1 }, teeth, 'en', '')).toBeNull();
});
