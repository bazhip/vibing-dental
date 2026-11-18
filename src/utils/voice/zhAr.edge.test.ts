import { replaceSpokenNumbers } from './numbers';
import { normalizeTranscript, chunkWorthSending } from '../aiAutofill';
import { getInitialToothData } from '../../constants';

it.each([
  ['牙周袋五点五毫米', '牙周袋5.5毫米'],
  ['牙周袋零点五毫米', '牙周袋0.5毫米'],
  ['第一百零四天复查', '第一百零四天复查'],
])('Chinese handles decimal or ordinal phrase %s', (source, expected) => {
  expect(replaceSpokenNumbers(source, 'zh')).toBe(expected);
});

it.each([
  ['zh', '牙龈炎二一零四牙周袋五毫米', /牙龈炎\s*2\s+104/],
  ['ar', 'قلح ثلاثة واحد صفر أربعة جيب خمسة مليمتر', /قلح 3 104/],
] as const)('%s keeps a score separate from a digit-spoken next tooth', (lng, source, expected) => {
  expect(normalizeTranscript(source, lng)).toMatch(expected);
});

it('Arabic recognizes vowel-marked score terms and numeral words together', () => {
  expect(replaceSpokenNumbers('جَيْب خَمْسَة مليمتر', 'ar')).toBe('جَيْب 5 مليمتر');
});

it('Arabic does not send vowel-marked filler-only speech', () => {
  expect(chunkWorthSending('نَعَمْ حَسَنًا شُكْرًا', 'ar')).toBe(false);
});

it('Arabic recognizes every dog/cat permanent and deciduous Triadan dictated digit by digit', () => {
  const words = ['صفر', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
  for (const species of ['canine', 'feline', 'canine-deciduous', 'feline-deciduous'] as const) {
    for (const tooth of getInitialToothData(species)) {
      const source = [...String(tooth.triadan)].map(digit => words[Number(digit)]).join(' ');
      expect(replaceSpokenNumbers(source, 'ar'), source).toBe(String(tooth.triadan));
    }
  }
});
