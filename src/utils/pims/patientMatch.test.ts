import { normaliseName, ownerSurname, patientsMatch, patientsMatchStrict, pimsPatientMatch, samePatientNumber } from './patientMatch';

it.each([
  ['Bella', 'Bella Smith', true],
  ['Bella Smith', 'Bella', true],
  ['Zoë', 'zoe', true],
  ['Bella', 'Max', false],
  ['', 'Max', false],
  ['Bella', null, false],
  // whole words only
  ['Max', 'Maxine', false],
  ['Bo', 'Bobby Jones', false],
  ['Maxine', 'Max', false],
  ['Bella', 'Smith, Bella', true],
  ['Bella Rose', 'Bella Smith', false],
])('%s vs %s', (a, b, ok) => expect(patientsMatch(a, b as string | null)).toBe(ok));

it('normaliseName folds case, accents, punctuation and spaces', () => {
  expect(normaliseName('  Zoë   (Smith) ')).toBe('zoe smith');
});

describe('ownerSurname', () => {
  it.each([
    ['Jane Smith', ['smith']],
    ['Mrs Jane Smith', ['smith']],
    ['Dr. Jane Smith', ['smith']],
    ['Smith, Jane', ['smith']],
    ['Van Der Berg, Anna', ['van', 'der', 'berg']],
    ['Smith', ['smith']],
    ['', []],
    [null, []],
  ])('%s', (owner, out) => expect(ownerSurname(owner as string | null)).toEqual(out));
});

describe('patientsMatchStrict', () => {
  it.each([
    // equal once normalised
    ['Bella', 'Jane Smith', 'bella', true],
    ['Zoë Smith', '', 'Zoe Smith', true],
    // chart name + owner surname, in either order
    ['Bella', 'Jane Smith', 'Bella Smith', true],
    ['Bella', 'Mrs Jane Smith', 'Smith, Bella', true],
    ['Bella', 'Smith, Jane', 'Bella Smith', true],
    // a one-word chart name is not enough on its own
    ['Bella', 'Jane Jones', 'Bella Smith', false],
    ['Bella', '', 'Bella Smith', false],
    ['Bella Smith', 'Jane Smith', 'Bella', false],
    ['Max', 'Jane Smith', 'Maxine Smith', false],
    ['Bella', 'Jane Smith', 'Bella Rose Smith', false],
    ['Bella', 'Jane Smith', null, false],
    ['', 'Jane Smith', 'Smith', false],
  ])('%s (owner %s) vs %s', (chart, owner, ezyvet, ok) =>
    expect(patientsMatchStrict(chart, owner, ezyvet as string | null)).toBe(ok));
});

describe('samePatientNumber', () => {
  it.each([
    ['00123', ' 123 ', true],
    ['123', '124', false],
    ['0', '000', true],
    ['0', '00123', false],
    ['AB12', 'ab12', true],
    [' AB12 ', 'ab12', true],
    ['0AB12', 'AB12', false],
    ['', '123', null],
    ['123', '  ', null],
    [null, '1', null],
    ['1', undefined, null],
    ['', '', null],
  ])('%s vs %s', (a, b, out) => expect(samePatientNumber(a as string | null, b as string | null)).toBe(out));
});

describe('pimsPatientMatch', () => {
  const nameRule = vi.fn(patientsMatch);
  beforeEach(() => nameRule.mockClear());

  it('equal numbers are the same patient even when the names differ', () => {
    expect(pimsPatientMatch({ name: 'Bella', number: '00123' }, { name: 'Max', number: '123' }, nameRule)).toBe('same');
    expect(nameRule).not.toHaveBeenCalled();
  });

  it('different numbers are a different patient even when the names are equal', () => {
    expect(pimsPatientMatch({ name: 'Bella', number: '123' }, { name: 'Bella', number: '124' }, nameRule)).toBe('different');
    expect(nameRule).not.toHaveBeenCalled();
  });

  it.each([
    ['', '123'],
    ['123', null],
    ['  ', ''],
  ])('a missing number (%s / %s) leaves it to the name rule', (chartNumber, ezyvetNumber) => {
    expect(pimsPatientMatch({ name: 'Bella', number: chartNumber }, { name: 'Bella Smith', number: ezyvetNumber }, nameRule)).toBe('same');
    expect(pimsPatientMatch({ name: 'Bella', number: chartNumber }, { name: 'Max', number: ezyvetNumber }, nameRule)).toBe('different');
    expect(nameRule).toHaveBeenCalledWith('Bella', 'Bella Smith');
  });
});
