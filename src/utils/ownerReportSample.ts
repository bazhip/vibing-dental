import { ChartSnapshot, EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from '../types';
import { getInitialToothData } from '../constants';
import i18n from '../i18n';
import type { ReportLocale } from './ownerReportI18n';

/**
 * A made-up visit (its free text in `lng`, the template's language) used to preview owner report templates in Practice
 * settings — enough findings to exercise every section (extractions,
 * per-tooth findings with grades, a missing tooth, an exam note, a team
 * note, and a recheck date).
 */
export function sampleOwnerReportSnapshot(lng: ReportLocale = 'en'): ChartSnapshot {
  const t = i18n.getFixedT(lng, 'client');
  const toothData = getInitialToothData('canine').map((tooth) => {
    switch (tooth.triadan) {
      case 104:
        return { ...tooth, pocket: '5', gingivitis: '2' };
      case 108:
        return { ...tooth, furcation: '3', mobility: 'M2', pdstate: '4' };
      case 204:
        return { ...tooth, calculus: '2', gingivitis: '1' };
      case 309:
        return { ...tooth, calculus: '3', recession: '2' };
      default:
        return { ...tooth };
    }
  });
  return {
    patientInfo: {
      patientName: 'Biscuit',
      patientNumber: 'SAMPLE-1',
      ownerName: 'Sam Rivera',
      ownerPhone: '',
      ownerEmail: '',
      doctor: '',
      tech: '',
      date: '2026-07-19',
      complaint: '',
      treatmentReport: '',
      recallDate: '2027-01-19',
      nerveBlocks: { ...EMPTY_NERVE_BLOCKS },
      exam: {
        ...EMPTY_EXAM_FINDINGS,
        buccal: { status: 'abnormal', comment: t('sample.buccalComment') },
      },
    },
    toothData,
    species: 'canine',
    logo: 'socal',
    preMarks: { 101: 'missing' },
    preComments: [],
    preStrokes: [],
    postMarks: { 108: 'extracted' },
    postComments: [{ id: 'sample-1', text: t('sample.postComment'), anchorTriadan: 204 }],
    postStrokes: [],
    ownerReport: {
      extraNotes: t('sample.extraNotes'),
    },
  };
}
