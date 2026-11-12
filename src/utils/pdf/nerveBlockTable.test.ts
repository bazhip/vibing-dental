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

describe('caudal maxillary block', () => {
  it('keeps the original table height when unused, adds a row when used', async () => {
    const base = await tableBottom({ ...EMPTY_NERVE_BLOCKS });
    const used = await tableBottom({ ...EMPTY_NERVE_BLOCKS, caudalMaxillaryRight: '0.3' });
    expect(used).toBeGreaterThan(base);
    expect(await tableBottom({ ...EMPTY_NERVE_BLOCKS, caudalMaxillaryRight: '', caudalMaxillaryLeft: '' })).toBe(base);
  });

  it('old charts load with the new sites blank', () => {
    const nb = normalizeNerveBlocks({ infraorbitalRight: '0.2' });
    expect(nb.caudalMaxillaryRight).toBe('');
    expect(nb.caudalMaxillaryLeft).toBe('');
    expect(nb.infraorbitalRight).toBe('0.2');
  });
});

describe('nerve block rows hidden in chart settings', () => {
  async function bottomWith(nb: NerveBlocks, hidden: string[]): Promise<number> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    return drawNerveBlockTable(page, nb, bold, regular, false, hidden);
  }
  it('drops a hidden row only while it is empty', async () => {
    const all = await bottomWith({ ...EMPTY_NERVE_BLOCKS }, []);
    const fewer = await bottomWith({ ...EMPTY_NERVE_BLOCKS }, ['mental', 'inferiorAlveolar']);
    expect(fewer).toBeLessThan(all);
    const withDose = await bottomWith({ ...EMPTY_NERVE_BLOCKS, mentalRight: '0.2' }, ['mental', 'inferiorAlveolar']);
    expect(withDose).toBeGreaterThan(fewer); // mental comes back
  });
});

describe('custom nerve blocks and fields in the PDF', () => {
  async function bottomWithCustom(custom: Parameters<typeof drawNerveBlockTable>[6]): Promise<number> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    return drawNerveBlockTable(page, { ...EMPTY_NERVE_BLOCKS }, bold, regular, false, [], custom);
  }
  it('unchanged without custom values; filled blocks add rows and fields add lines', async () => {
    const base = await bottomWithCustom(undefined);
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
