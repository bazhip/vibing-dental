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

export function changesPatientIdentity(saved: PatientIdentity, proposed: PatientIdentity): boolean {
  return (['patient_name', 'patient_number'] as const).some((field) =>
    normalize(saved[field]) !== '' && normalize(saved[field]) !== normalize(proposed[field])
  );
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
