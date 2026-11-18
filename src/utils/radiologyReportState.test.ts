import { describe, expect, it } from 'vitest';
import type { ChartSnapshot } from '../types';
import { hasRadiologySource, isRadiologyReportReviewed, radiologyReportText, radiologyReviewBasis, radiologySourceBasis } from './radiologyReportState';

export function radiologySnapshot(): ChartSnapshot {
  return { patientInfo: { patientName:'Milo',patientNumber:'P-1',ownerName:'Private owner',ownerPhone:'555-1234',ownerEmail:'private@example.test',
    doctor:'Dr Rivera',tech:'',date:'2026-11-17',complaint:'Pain when chewing',treatmentReport:'',radiographicFindings:'108: 4.5 mm lucency; possible fracture',
    nerveBlocks:{},exam:{} }, toothData:[],species:'canine',logo:'none',preMarks:{},postMarks:{},preComments:[],postComments:[],preStrokes:[],postStrokes:[] } as unknown as ChartSnapshot;
}

describe('radiology report source and review state', () => {
  it('requires recorded findings, with clinical context optional', () => {
    const chart=radiologySnapshot();expect(hasRadiologySource(chart)).toBe(true);
    chart.patientInfo.radiographicFindings='';chart.patientInfo.complaint='';expect(hasRadiologySource(chart)).toBe(false);
    chart.patientInfo.radiologyQuestion='Assess tooth 108';expect(hasRadiologySource(chart)).toBe(false);
  });
  it('keeps generated text, review flags, and owner contact outside the source basis', () => {
    const chart=radiologySnapshot(),basis=radiologySourceBasis(chart);
    Object.assign(chart.patientInfo,{radiologyReport:'Draft',radiologyReportLanguage:'fr',radiologyReviewedBasis:'anything',radiologyReportBasis:'anything',radiologyReportGeneratedAt:'2026-11-17',ownerName:'Changed',ownerPhone:'Changed',ownerEmail:'Changed'});
    expect(radiologySourceBasis(chart)).toBe(basis);
    expect(basis).not.toContain('private@example.test');expect(basis).not.toContain('Private owner');
  });
  it.each(['radiographicFindings','radiologyHistory','radiologyTechnique','radiologyQuestion','complaint','treatmentReport'] as const)('invalidates the source when %s changes', key => {
    const chart=radiologySnapshot(),basis=radiologySourceBasis(chart);chart.patientInfo[key]='Changed';
    expect(radiologySourceBasis(chart)).not.toBe(basis);
  });
  it('binds explicit review to source, exact body and report language', () => {
    const chart=radiologySnapshot();Object.assign(chart.patientInfo,{radiologyReport:'Findings: 108 lucency',radiologyReportLanguage:'en'});
    chart.patientInfo.radiologyReportBasis=radiologySourceBasis(chart);
    chart.patientInfo.radiologyReviewedBasis=radiologyReviewBasis(chart,'en');
    expect(isRadiologyReportReviewed(chart,'en')).toBe(true);
    expect(isRadiologyReportReviewed(chart,'fr')).toBe(false);
    expect(radiologyReportText(chart,'en')).toContain('Milo');
    chart.patientInfo.radiologyReport+=' edited';expect(isRadiologyReportReviewed(chart,'en')).toBe(false);
  });
  it('supports explicit re-review against changed source without trusting old approval', () => {
    const chart=radiologySnapshot();Object.assign(chart.patientInfo,{radiologyReport:'Recorded findings',radiologyReportLanguage:'en'});
    chart.patientInfo.radiologyReportBasis=radiologySourceBasis(chart);chart.patientInfo.radiologyReviewedBasis=radiologyReviewBasis(chart);
    chart.patientInfo.radiologyTechnique='Two intraoral views';expect(isRadiologyReportReviewed(chart)).toBe(false);
    const review=radiologyReviewBasis(chart);chart.patientInfo.radiologyReportBasis=radiologySourceBasis(chart);chart.patientInfo.radiologyReviewedBasis=review;
    expect(isRadiologyReportReviewed(chart)).toBe(true);
  });
  it('does not export unreviewed, stale or mismatched-language reports', () => {
    const chart=radiologySnapshot();chart.patientInfo.radiologyReport='Unreviewed text';
    expect(isRadiologyReportReviewed(chart)).toBe(false);
    expect(radiologyReportText(chart)).toBe('');
  });
});

it('preserves report review across JSONB object-key reordering without ignoring changed clinical values or array order', () => {
  const chart=radiologySnapshot();
  chart.patientInfo.exam={buccal:{status:'abnormal',comment:'Recorded ulcer'},tongue:{comment:'Recorded lesion',status:'abnormal'}} as typeof chart.patientInfo.exam;
  chart.toothData=[{triadan:108,tooth:'P4',pocket:'4.5',mobility:'1'},{mobility:'0',pocket:'2',tooth:'C',triadan:104}] as typeof chart.toothData;
  chart.preComments=[{id:'one',text:'108: possible fracture',anchorTriadan:108},{anchorTriadan:104,text:'104: recorded finding',id:'two'}] as typeof chart.preComments;
  Object.assign(chart.patientInfo,{radiologyReport:'Findings: 108 possible fracture',radiologyReportLanguage:'en'});
  chart.patientInfo.radiologyReportBasis=radiologySourceBasis(chart);
  chart.patientInfo.radiologyReviewedBasis=radiologyReviewBasis(chart,'en');
  const reorder=(value:unknown):unknown=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'
    ? Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reorder(item)])):value;
  const cloud=JSON.parse(JSON.stringify(reorder(chart))) as typeof chart;
  expect(radiologySourceBasis(cloud)).toBe(chart.patientInfo.radiologyReportBasis);
  expect(radiologyReviewBasis(cloud,'en')).toBe(chart.patientInfo.radiologyReviewedBasis);
  expect(isRadiologyReportReviewed(cloud,'en')).toBe(true);
  cloud.toothData[0].pocket='4.6';expect(isRadiologyReportReviewed(cloud,'en')).toBe(false);
  cloud.toothData[0].pocket='4.5';cloud.preComments.reverse();expect(isRadiologyReportReviewed(cloud,'en')).toBe(false);
});
