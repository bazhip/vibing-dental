import { describe, expect, it } from 'vitest';
import type { ChartSnapshot } from '../types';
import { mergeChartSnapshots } from './chartSnapshotMerge';

const base = {
  species: 'canine',
  patientInfo: { patientName: 'Milo', patientNumber: '17', ownerPhone: '555', treatmentReport: '' },
  toothData: [{ tooth: '108', triadan: 108 }, { tooth: '208', triadan: 208 }],
} as ChartSnapshot;

describe('chart merge', () => {
  it('combines edits to different teeth and independent patient fields', () => {
    const laptop = structuredClone(base);
    laptop.patientInfo.ownerPhone = '111';
    laptop.toothData[0].pocket = '3';
    const phone = structuredClone(base);
    phone.patientInfo.treatmentReport = 'Charted on phone';
    phone.toothData[1].mobility = '2';
    expect(mergeChartSnapshots(base, laptop, phone)).toMatchObject({
      patientInfo: { ownerPhone: '111', treatmentReport: 'Charted on phone' },
      toothData: [{ triadan: 108, pocket: '3' }, { triadan: 208, mobility: '2' }],
    });
  });

  it('keeps overlapping observations and lifecycle changes for review', () => {
    const laptop = structuredClone(base);
    const phone = structuredClone(base);
    laptop.toothData[0].pocket = '3';
    phone.toothData[0].pocket = '6';
    expect(mergeChartSnapshots(base, laptop, phone)).toBeNull();
    phone.toothData[0].pocket = '3';
    phone.finalizedAt = '2026-11-19T12:00:00Z';
    expect(mergeChartSnapshots(base, laptop, phone)).toBeNull();
  });
});
