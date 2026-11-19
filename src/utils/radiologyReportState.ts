import i18n from '../i18n';
import { isAppLanguage, type AppLanguage } from '../i18n/config';
import type { ChartSnapshot, PatientInfo } from '../types';

const text = (value: unknown): string => typeof value === 'string' ? value : '';
function reportLanguage(snapshot: ChartSnapshot, lng?: AppLanguage): AppLanguage {
  if (lng) return lng;
  const stored = snapshot.patientInfo.radiologyReportLanguage;
  return isAppLanguage(stored) ? stored : 'en';
}

/** JSONB preserves values and array order, but not object key insertion order. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const object = item as Record<string, unknown>;
    return Object.fromEntries(Object.keys(object).sort().map(key => [key, object[key]]));
  });
}

/** Exact canonical local staleness marker, not authentication or an independently observed source signature. */
export function radiologySourceBasis(snapshot: ChartSnapshot): string {
  const info = snapshot.patientInfo;
  return canonicalJson([
    snapshot.species, info.patientName, info.patientNumber, info.date, info.doctor, info.tech,
    text(info.complaint), text(info.treatmentReport), text(info.radiographicFindings),
    text(info.radiologyHistory), text(info.radiologyTechnique), text(info.radiologyQuestion),
    text(info.consultationHistory), text(info.consultationAssessment), text(info.consultationPlan),
    info.exam ?? null, info.customExam ?? null, info.recallDate ?? '',
    snapshot.toothData, snapshot.preMarks ?? {}, snapshot.postMarks ?? {},
    snapshot.preComments ?? [], snapshot.postComments ?? [],
  ]);
}

/** The body and chosen language are checked separately from its persisted source/review markers. */
export function radiologyReviewBasis(snapshot: ChartSnapshot, lng?: AppLanguage): string {
  return JSON.stringify([radiologySourceBasis(snapshot), reportLanguage(snapshot, lng), text(snapshot.patientInfo.radiologyReport)]);
}

export function isRadiologyReportReviewed(snapshot: ChartSnapshot, lng?: AppLanguage): boolean {
  const info = snapshot.patientInfo, language = reportLanguage(snapshot, lng);
  return !!text(info.radiologyReport).trim() && text(info.radiologyReport).length <= 60000
    && info.radiologyReportLanguage === language && info.radiologyReportBasis === radiologySourceBasis(snapshot)
    && info.radiologyReviewedBasis === radiologyReviewBasis(snapshot, language);
}

export function radiologyReportText(snapshot: ChartSnapshot, lng?: AppLanguage, reportKind: 'radiology' | 'ct' = 'radiology'): string {
  const language = reportLanguage(snapshot, lng);
  if (!isRadiologyReportReviewed(snapshot, language)) return '';
  const t = i18n.getFixedT(language, 'app'), info = snapshot.patientInfo;
  return [t(reportKind === 'ct' ? 'ctReport.title' : 'radiologyReport.title'), t('radiologyReport.attribution', {
    patient: info.patientName || t('radiologyReport.notRecorded'), number: info.patientNumber || t('radiologyReport.notRecorded'),
    date: info.date || t('radiologyReport.notRecorded'),
  }), text(info.radiologyReport)].join('\n\n');
}

/** Current visible radiology text, including an explicit clear, owns downstream output. */
export function radiologyRecordedText(info: PatientInfo): string {
  return typeof info.radiographicFindings === 'string' ? info.radiographicFindings : text(info.radiologyReport);
}

/** A stored editor value, including an explicit empty string, owns the text.
 * Older visits keep their recorded context when first opened in the single editor. */
export function radiologyEditorText(snapshot: ChartSnapshot, lng: AppLanguage = 'en'): string {
  const info = snapshot.patientInfo;
  if (typeof info.radiologyReport === 'string') return info.radiologyReport;
  const t = i18n.getFixedT(lng, 'app');
  const context = ([['radiologyHistory', 'headingHistory'], ['radiologyTechnique', 'headingTechnique'], ['radiologyQuestion', 'headingQuestion']] as const)
    .filter(([field]) => text(info[field]).trim())
    .map(([field, heading]) => `${t(`radiologyReport.${heading}`)}\n${text(info[field])}`);
  if (!context.length) return text(info.radiographicFindings);
  return [...context, text(info.radiographicFindings).trim() ? `${t('radiologyReport.headingFindings')}\n${text(info.radiographicFindings)}` : ''].filter(Boolean).join('\n\n');
}

export function appendRadiologyDictation(snapshot: ChartSnapshot, value: string, lng: AppLanguage): Partial<ChartSnapshot['patientInfo']> {
  const draft = radiologyRecordedText(snapshot.patientInfo), findings = draft;
  return { radiologyReport: draft ? `${draft}\n${value}` : value,
    radiographicFindings: findings ? `${findings}\n${value}` : value,
    radiologyReportLanguage: lng, radiologyReviewedBasis: '' };
}

export function hasRadiologySource(snapshot: ChartSnapshot): boolean {
  const info = snapshot.patientInfo;
  return !!(typeof info.radiologyReport === 'string' ? info.radiologyReport : text(info.radiographicFindings)).trim();
}
