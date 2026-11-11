import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { drawNerveBlockTable } from './sections';
import {
  EMPTY_NERVE_BLOCKS,
  NerveBlocks,
  effectiveNerveBlockDrugs,
  formatAnestheticDrug,
  normalizeNerveBlocks,
} from '../../types';

async function tableBottom(nb: NerveBlocks, isVca = false): Promise<number> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bottom = drawNerveBlockTable(page, nb, bold, regular, isVca);
  return bottom;
}

describe('nerve-block anesthetics', () => {
  it('migrates the legacy single drug string to a 0.5% list entry', () => {
    const nb = normalizeNerveBlocks({ ...EMPTY_NERVE_BLOCKS, drugs: undefined, drug: 'Lidocaine', mentalLeft: '0.2' });
    expect(nb.drugs).toEqual([{ name: 'Lidocaine', concentration: '0.5' }]);
    expect(nb.mentalLeft).toBe('0.2');
    expect('drug' in nb).toBe(false);
    expect(normalizeNerveBlocks({ drug: '' }).drugs).toEqual([]);
    expect(normalizeNerveBlocks(undefined)).toEqual(EMPTY_NERVE_BLOCKS);
  });

  it('falls back to the template default when no drug is named', () => {
    expect(effectiveNerveBlockDrugs({ drugs: [{ name: ' ', concentration: '2' }] }, 'vca'))
      .toEqual([{ name: 'Ropivacaine', concentration: '0.5' }]);
    expect(formatAnestheticDrug({ name: 'Lidocaine', concentration: '2%' })).toBe('2% Lidocaine');
    expect(formatAnestheticDrug({ name: 'Mystery', concentration: '' })).toBe('Mystery');
  });

  it('keeps the single-drug table the same height and grows for a mix', async () => {
    const single = await tableBottom({ ...EMPTY_NERVE_BLOCKS });
    const one = await tableBottom({ ...EMPTY_NERVE_BLOCKS, drugs: [{ name: 'Bupivacaine', concentration: '0.5' }] });
    expect(one).toBeCloseTo(single, 5);

    const three = await tableBottom({
      ...EMPTY_NERVE_BLOCKS,
      infraorbitalRight: '0.3', mentalLeft: '0.2',
      drugs: [
        { name: 'Bupivacaine', concentration: '0.5' },
        { name: 'Lidocaine', concentration: '2' },
        { name: 'Dexmedetomidine', concentration: '0.05' },
      ],
    });
    expect(three).toBeGreaterThan(single);

    const many = await tableBottom({
      ...EMPTY_NERVE_BLOCKS,
      drugs: ['Bupivacaine', 'Lidocaine', 'Ropivacaine', 'Mepivacaine', 'Dexmedetomidine', 'Buprenorphine']
        .map((name) => ({ name, concentration: '0.5' })),
    });
    expect(many).toBeGreaterThan(three);
  });
});
