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
    const used = { ...EMPTY_NERVE_BLOCKS, infraorbitalRight: '0.3', mentalLeft: '0.2' };
    const single = await tableBottom(used);
    const one = await tableBottom({ ...used, drugs: [{ name: 'Bupivacaine', concentration: '0.5' }] });
    expect(one).toBeCloseTo(single, 5);

    const three = await tableBottom({
      ...used,
      drugs: [
        { name: 'Bupivacaine', concentration: '0.5' },
        { name: 'Lidocaine', concentration: '2' },
        { name: 'Dexmedetomidine', concentration: '0.05' },
      ],
    });
    expect(three).toBeGreaterThan(single);

    const many = await tableBottom({
      ...used,
      drugs: ['Bupivacaine', 'Lidocaine', 'Ropivacaine', 'Mepivacaine', 'Dexmedetomidine', 'Buprenorphine']
        .map((name) => ({ name, concentration: '0.5' })),
    });
    expect(many).toBeGreaterThan(three);
  });
});

describe('only the blocks given are printed', () => {
  it('leaves the card out when nothing was given', async () => {
    const top = await tableBottom({ ...EMPTY_NERVE_BLOCKS, drugs: [{ name: 'Nocita', concentration: '13.3' }] });
    expect(top).toBe(await tableBottom({ ...EMPTY_NERVE_BLOCKS, mentalRight: '  ', other: ' ' }));
    expect(await tableBottom({ ...EMPTY_NERVE_BLOCKS, other: 'Infiltrative block' })).toBeGreaterThan(top);
  });

  it('adds one row per block given, and the Other row only with text', async () => {
    const one = await tableBottom({ ...EMPTY_NERVE_BLOCKS, infraorbitalRight: '0.3' });
    const two = await tableBottom({ ...EMPTY_NERVE_BLOCKS, infraorbitalRight: '0.3', mentalLeft: '0.2' });
    const caudal = await tableBottom({ ...EMPTY_NERVE_BLOCKS, infraorbitalRight: '0.3', caudalMaxillaryLeft: '0.2' });
    expect(two).toBeGreaterThan(one);
    expect(caudal).toBeCloseTo(two, 5);
    expect(await tableBottom({ ...EMPTY_NERVE_BLOCKS, infraorbitalRight: '0.3', other: 'Note' })).toBeGreaterThan(one);
  });

  it('old charts load with the caudal maxillary sites blank', () => {
    const nb = normalizeNerveBlocks({ infraorbitalRight: '0.2' });
    expect(nb.caudalMaxillaryRight).toBe('');
    expect(nb.caudalMaxillaryLeft).toBe('');
    expect(nb.infraorbitalRight).toBe('0.2');
  });
});

describe('custom nerve blocks and fields in the PDF', () => {
  async function bottomWithCustom(custom: Parameters<typeof drawNerveBlockTable>[5]): Promise<number> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    return drawNerveBlockTable(page, { ...EMPTY_NERVE_BLOCKS }, bold, regular, false, custom);
  }
  it('unchanged without custom values; filled blocks add rows and fields add lines', async () => {
    const base = await bottomWithCustom(undefined); // nothing given: no card
    expect(await bottomWithCustom({ blocks: [{ id: 'b', label: 'Empty', right: '', left: '' }], fields: [] })).toBe(base);
    const withBlock = await bottomWithCustom({ blocks: [{ id: 'b', label: 'Major palatine', right: '0.2', left: '' }], fields: [] });
    expect(withBlock).toBeGreaterThan(base);
    const withFields = await bottomWithCustom({ blocks: [], fields: [
      { id: 'a', label: 'Premedication', type: 'text', value: 'Dexmedetomidine' },
      { id: 'b', label: 'ET tube', type: 'number', unit: 'mm', value: '7' },
      { id: 'c', label: 'Fluids', type: 'text', value: 'LRS' },
      { id: 'd', label: 'IV catheter', type: 'checkbox', value: 'yes' },
    ] });
    expect(withFields).toBeGreaterThan(base);
  });
});
