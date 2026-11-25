import React from 'react';
import i18n from '../i18n';
import type { ChoiceOptions } from '../components/ui/dialogs';

export interface PatientIdentity {
  patient_name: string;
  patient_number: string;
}

const normalize = (value: string) => (value ?? '').trim().toLowerCase();

export function identityKey(identity: PatientIdentity): string {
  return JSON.stringify([normalize(identity.patient_name), normalize(identity.patient_number)]);
}

/**
 * True when `proposed` changes an established name or number. Not yet
 * established: a blank value, the auto-generated placeholder number
 * (`generatedNumber`, replaced by the practice's own number), or a value
 * still being entered — autosave lands between keystrokes and while the
 * user switches to their PIMS to copy the rest, so a saved prefix of the
 * proposed value is the same entry continuing.
 */
export function changesPatientIdentity(saved: PatientIdentity, proposed: PatientIdentity, generatedNumber = ''): boolean {
  return (['patient_name', 'patient_number'] as const).some((field) => {
    const before = normalize(saved[field]);
    const after = normalize(proposed[field]);
    if (before === '' || after.startsWith(before)) return false;
    return !(field === 'patient_number' && before === normalize(generatedNumber));
  });
}

export function patientIdentityQuestion(saved: PatientIdentity, proposed: PatientIdentity): ChoiceOptions {
  const t = i18n.getFixedT(null, 'app');
  const label = (identity: PatientIdentity) =>
    [identity.patient_name.trim(), identity.patient_number.trim()].filter(Boolean).join(' · ') || t('sync.identity.blank');
  return {
    title: t('sync.identity.title'),
    message: React.createElement('div', { style: { whiteSpace: 'pre-line', overflowWrap: 'anywhere' } },
      t('sync.identity.message', { saved: label(saved), proposed: label(proposed) })),
    choices: [{ value: 'correct', label: t('sync.identity.confirm') }],
  };
}
