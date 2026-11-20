import { describe, expect, it } from 'vitest';
import type { ChartSnapshot } from '../types';
import { changeConsultationLayout, dischargeVisitSections, STANDARD_DISCHARGE } from './consultationTemplates';
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

it('retains a Discharge field edited on another device during a template switch', () => {
  const section = { id: 'dischargeCustom_activity', label: 'Activity' } as const;
  const layout = { id: 'custom-recovery', fields: [], sections: [section] };
  const original = { ...base, patientInfo: { ...base.patientInfo, dischargeLayout: layout } };
  const change = changeConsultationLayout(original.patientInfo, layout, STANDARD_DISCHARGE, 'discharge');
  const laptop = { ...original, patientInfo: { ...original.patientInfo, ...change } };
  const phone = { ...original, patientInfo: { ...original.patientInfo, [section.id]: 'Lead walks only.' } };
  const merged = mergeChartSnapshots(original, laptop, phone);
  expect(merged?.patientInfo[section.id]).toBe('Lead walks only.');
  expect(dischargeVisitSections(merged!.patientInfo)).toContainEqual(section);
});
