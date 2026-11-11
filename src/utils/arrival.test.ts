import { shouldOpenLibraryOnArrival } from './arrival';

const base = { bareArrival: true, chartDate: '2026-11-11', today: '2026-11-11', patientName: 'Bella', dirty: false };

describe('shouldOpenLibraryOnArrival', () => {
  it("reopens today's visit", () => {
    expect(shouldOpenLibraryOnArrival(base)).toBe(false);
  });
  it("opens My charts instead of a past day's chart", () => {
    expect(shouldOpenLibraryOnArrival({ ...base, chartDate: '2026-11-10' })).toBe(true);
  });
  it('never strands unsaved changes, whatever the date', () => {
    expect(shouldOpenLibraryOnArrival({ ...base, chartDate: '2026-11-10', dirty: true })).toBe(false);
  });
  it('a blank chart has nothing to continue', () => {
    expect(shouldOpenLibraryOnArrival({ ...base, patientName: '  ' })).toBe(true);
  });
  it('a link or reload of a chart (#/ route) always stays put', () => {
    expect(shouldOpenLibraryOnArrival({ ...base, chartDate: '2026-01-01', bareArrival: false })).toBe(false);
  });
});
