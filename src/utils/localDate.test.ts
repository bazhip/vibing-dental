import { localDateISO, parseLocalDate } from './localDate';

describe('localDateISO', () => {
  it('uses local calendar parts, not UTC', () => {
    const evening = new Date(2026, 10, 10, 23, 30); // local 10 Nov, 11:30 pm
    expect(localDateISO(evening)).toBe('2026-11-10');
  });
  it('round-trips with parseLocalDate', () => {
    expect(localDateISO(parseLocalDate('2026-02-28')!)).toBe('2026-02-28');
    expect(parseLocalDate('nope')).toBeNull();
  });
});
