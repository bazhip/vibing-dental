import { fitCommentForExport } from './svgToPng';

describe('fitCommentForExport', () => {
  it('shrink-wraps a short note to its text and label', () => {
    const { w, h } = fitCommentForExport('T/FX', 'C (104)', 300);
    expect(w).toBeLessThan(300);
    expect(w).toBeGreaterThanOrEqual(70);
    expect(h).toBe(8 * 2 + 22 + 22 + 2); // label + one line
  });

  it('caps width at the gutter and grows height for wrapped lines', () => {
    const long = 'Mobility 3 · Calculus 2 · Gingivitis 2 · Pocket 5 · Furcation 3';
    const { w, h } = fitCommentForExport(long, 'I2 (102)', 220);
    expect(w).toBe(220);
    expect(h).toBeGreaterThan(8 * 2 + 22 + 22 * 2);
  });
});
