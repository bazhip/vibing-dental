import { PDFDocument, StandardFonts } from 'pdf-lib';
import { layoutTreatmentArea } from './pdf/sections';

const helvetica = async () => (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
import { applyAiActions, invalidReason } from './aiAutofill';

describe('radiographic findings', () => {
  // Page 2's right column: 7.7in tall, 5.1in wide (TREATMENT_REPORT).
  const H = 7.7 * 72;
  const W = 5.1 * 72;
  const GAP = 0.12 * 72;
  const total = (cards: { heightPt: number }[]) =>
    cards.reduce((n, c) => n + c.heightPt, 0) + GAP * (cards.length - 1);

  it('PDF: one treatment card filling the column without reports', async () => {
    const font = await helvetica();
    const { cards, fontSize } = layoutTreatmentArea({ treatment: 'Scaled and polished.', radiographic: '  ', ct: '' }, font, H, W);
    expect(cards.map((c) => c.kind)).toEqual(['treatment']);
    expect(cards[0].heightPt).toBeCloseTo(H);
    expect(fontSize).toBe(9.5);
  });

  it('PDF: radiographic and CT reports get their own cards below the treatment report', async () => {
    const font = await helvetica();
    const { cards } = layoutTreatmentArea({ treatment: 'Scaled and polished.', radiographic: '307: type 2 TR', ct: 'TMJs normal' }, font, H, W);
    expect(cards.map((c) => c.kind)).toEqual(['treatment', 'radiographic', 'ct']);
    expect(total(cards)).toBeCloseTo(H);
    // Short texts: the column is split evenly.
    expect(cards[0].heightPt).toBeCloseTo(cards[1].heightPt);
    expect(cards[1].heightPt).toBeCloseTo(cards[2].heightPt);
    expect(layoutTreatmentArea({ treatment: '', ct: 'TMJs normal' }, font, H, W).cards.map((c) => c.kind)).toEqual(['treatment', 'ct']);
  });

  it('PDF: a card that needs more than its share grows; the others stay even', async () => {
    const font = await helvetica();
    const para = 'Vertical bone loss at the distal root with furcation exposure and periapical lucency. ';
    const { cards, fontSize } = layoutTreatmentArea({ treatment: 'Scaled.', radiographic: para.repeat(12), ct: 'TMJs normal' }, font, H, W);
    expect(fontSize).toBe(9.5);
    expect(cards[1].heightPt).toBeGreaterThan(H / 3);
    expect(cards[0].heightPt).toBeCloseTo(cards[2].heightPt);
    expect(total(cards)).toBeCloseTo(H);
  });

  it('PDF: long reports shrink the text so everything still fits', async () => {
    const font = await helvetica();
    const para = 'Vertical bone loss at the distal root with furcation exposure and periapical lucency. ';
    const layout = layoutTreatmentArea({ treatment: para.repeat(25), radiographic: para.repeat(20), ct: para.repeat(20) }, font, H, W);
    expect(layout.fontSize).toBeLessThan(9.5);
    expect(total(layout.cards)).toBeLessThanOrEqual(H + 0.01);
  });

  it('PDF: text too long for any size shares the column without overflowing it', async () => {
    const font = await helvetica();
    const para = 'Vertical bone loss at the distal root with furcation exposure and periapical lucency. ';
    const layout = layoutTreatmentArea({ treatment: para.repeat(200), radiographic: 'Short', ct: para.repeat(200) }, font, H, W);
    expect(layout.fontSize).toBe(7.5);
    expect(total(layout.cards)).toBeLessThanOrEqual(H + 0.01);
    // A short report keeps its full height even when the others are capped.
    expect(layout.cards[1].heightPt).toBeLessThan(layout.cards[0].heightPt);
  });

  it('dictation can append findings and record a caudal maxillary block', () => {
    const appendRadiographicFindings = vi.fn();
    const setNerveBlock = vi.fn();
    const handlers = { appendRadiographicFindings, setNerveBlock } as never;
    const applied = applyAiActions([
      { name: 'append_radiographic_findings', input: { text: '108: vertical bone loss distal root' } },
      { name: 'set_nerve_block', input: { site: 'caudalMaxillaryLeft', mL: '0.3' } },
    ], handlers);
    expect(applied).toHaveLength(2);
    expect(appendRadiographicFindings).toHaveBeenCalledWith('108: vertical bone loss distal root');
    expect(setNerveBlock).toHaveBeenCalledWith('caudalMaxillaryLeft', '0.3');
    expect(invalidReason({ name: 'append_radiographic_findings', input: { text: 'x' } })).toBeNull();
  });
});
