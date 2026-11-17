import { isCurrentVisit, visitsForPatient } from './currentVisit';

describe('isCurrentVisit', () => {
  const today = '2026-11-11';

  it("the patient's latest visit dated today is editable", () => {
    expect(isCurrentVisit(today, today, [{ id: 'a' }, { id: 'old' }], 'a')).toBe(true);
  });

  it('a latest visit from a past day stays view-only', () => {
    expect(isCurrentVisit('2026-10-02', today, [{ id: 'a' }], 'a')).toBe(false);
  });

  it('an older visit stays view-only', () => {
    expect(isCurrentVisit('2026-10-02', today, [{ id: 'new' }, { id: 'a' }], 'a')).toBe(false);
  });

  it('a second chart dated today that is not the latest stays view-only', () => {
    expect(isCurrentVisit(today, today, [{ id: 'other' }, { id: 'a' }], 'a')).toBe(false);
  });

  it('before the visit list loads, the date decides', () => {
    expect(isCurrentVisit(today, today, [], 'a')).toBe(true);
    expect(isCurrentVisit('2026-10-02', today, [], 'a')).toBe(false);
  });
});

it('ignores the previous animal’s visits while the next animal loads', () => {
  const old = [{ id: 'luna', patient_number: '1042', patient_name: 'Luna' }];
  const visits = visitsForPatient(old, '1087', 'Oliver');
  expect(visits).toEqual([]);
  expect(isCurrentVisit('2026-11-16', '2026-11-16', visits, 'oliver')).toBe(true);
  expect(visitsForPatient(old, ' 1042 ', 'Luna')).toEqual(old);
});
