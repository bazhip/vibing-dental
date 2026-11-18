import type { ChartSnapshot, PatientInfo } from '../types';

export const ctRecordedText = (info: PatientInfo): string => typeof info.ctReport === 'string' ? info.ctReport : '';

const CT_REPORT_FIELDS = {
  radiologyReport: 'ctReport', radiologyReportLanguage: 'ctReportLanguage', radiologyReportBasis: 'ctReportBasis',
  radiologyReviewedBasis: 'ctReviewedBasis', radiologyReportGeneratedAt: 'ctReportGeneratedAt',
} as const;

/** Adapt CT storage to the shared report editor without borrowing x-ray findings/context. */
export function ctReportSnapshot(snapshot: ChartSnapshot): ChartSnapshot {
  const info = snapshot.patientInfo;
  return { ...snapshot, patientInfo: { ...info, radiologyReport: ctRecordedText(info),
    radiologyReportLanguage: info.ctReportLanguage, radiologyReportBasis: info.ctReportBasis,
    radiologyReviewedBasis: info.ctReviewedBasis, radiologyReportGeneratedAt: info.ctReportGeneratedAt,
    radiographicFindings: '', radiologyHistory: '', radiologyTechnique: '', radiologyQuestion: '' } };
}

/** Only CT-owned fields can leave the CT instance of the editor. */
export function ctReportChanges(changes: Partial<PatientInfo>): Partial<PatientInfo> {
  return Object.fromEntries(Object.entries(CT_REPORT_FIELDS).filter(([field]) => Object.hasOwn(changes, field))
    .map(([field, target]) => [target, changes[field as keyof typeof CT_REPORT_FIELDS]])) as Partial<PatientInfo>;
}
