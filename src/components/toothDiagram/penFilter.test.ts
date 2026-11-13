import { createPenFilter } from './penFilter';

describe('createPenFilter (Apple Pencil palm rejection)', () => {
  it('accepts finger touch before any pen has been seen (iPad with no Pencil)', () => {
    const f = createPenFilter();
    expect(f.accept('touch')).toBe(true);
    expect(f.accept('touch')).toBe(true);
  });

  it('rejects touch once a pen event has been seen, but keeps accepting pen', () => {
    const f = createPenFilter();
    expect(f.accept('pen')).toBe(true);
    expect(f.accept('touch')).toBe(false); // resting palm
    expect(f.accept('pen')).toBe(true);
    expect(f.accept('touch')).toBe(false);
  });

  it('always accepts mouse, before and after a pen', () => {
    const f = createPenFilter();
    expect(f.accept('mouse')).toBe(true);
    f.accept('pen');
    expect(f.accept('mouse')).toBe(true);
  });

  it('keeps separate state per filter instance', () => {
    const a = createPenFilter();
    const b = createPenFilter();
    a.accept('pen');
    expect(b.accept('touch')).toBe(true);
  });
});
