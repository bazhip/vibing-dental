import { patientsMatch } from './patientMatch';

it.each([['Bella', 'Bella Smith', true], ['Zoë', 'zoe', true], ['Bella', 'Max', false], ['', 'Max', false], ['Bella', null, false]])(
  '%s vs %s', (a, b, ok) => expect(patientsMatch(a, b as string | null)).toBe(ok));
