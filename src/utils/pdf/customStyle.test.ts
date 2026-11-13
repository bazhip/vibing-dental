import { PDF_STYLES, buildCustomStyle, contrastOnWhite, customStyleColor, customStyleId, resolvePdfStyle, styleSwatch } from './styles';

const rgbOf = (c: unknown) => { const p = c as { red: number; green: number; blue: number }; return [p.red, p.green, p.blue] as [number, number, number]; };

describe('custom PDF color', () => {
  it('round-trips the color and base layout through the style id', () => {
    const id = customStyleId('#7C3AED', 'journal');
    expect(id).toBe('custom:journal:#7c3aed');
    expect(customStyleColor(id)).toBe('#7c3aed');
    const s = resolvePdfStyle(id);
    expect(s.fontFamily).toBe('serif'); // Journal's layout
    expect(s.sectionTitle).toBe(PDF_STYLES.find((p) => p.id === 'journal')!.sectionTitle);
  });

  it('presets resolve to themselves and unknown ids fall back to the default', () => {
    expect(resolvePdfStyle('slate').id).toBe('slate');
    expect(resolvePdfStyle('nope').id).toBe(PDF_STYLES[0].id);
    expect(customStyleColor('slate')).toBeNull();
  });

  it('darkens a pale pick so white header text stays readable', () => {
    const s = buildCustomStyle('#ffee58'); // pale yellow
    expect(contrastOnWhite(rgbOf(s.palette.primary))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps an already-dark pick as chosen', () => {
    const s = buildCustomStyle('#1e3a8a');
    expect(styleSwatch(s)).toBe('#1e3a8a');
  });
});
