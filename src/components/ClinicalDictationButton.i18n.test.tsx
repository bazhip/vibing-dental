import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ClinicalDictationButton } from './ClinicalDictationButton';
import { sampleOwnerReportSnapshot } from '../utils/ownerReportSample';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import i18n from '../i18n';
vi.mock('../native/aiConsent', () => ({ ensureAiConsent: async () => true }));
vi.mock('../utils/clinicalDictationAi', async original => ({ ...await original<typeof import('../utils/clinicalDictationAi')>(), extractClinicalDictation: async () => [{ field: 'gpVitals', value: '38.5 °C', evidence: '38.5 °C' }] }));
vi.mock('../hooks/useVoiceCapture', () => ({ useVoiceCapture: () => ({ supported: false, recording: false, transcript: '', lng: 'en', stop: vi.fn(), clear: vi.fn(), error: null }) }));
beforeEach(installPseudoLocale);
afterEach(async () => { cleanup(); await restoreLocale(); });
it('translates the autofilled status, the double-check card, source history and unsupported-microphone states', async () => {
  const snapshot = sampleOwnerReportSnapshot();
  snapshot.patientInfo.gpVitals = '';
  snapshot.clinicalDictations = [{ id: 'source', kind: 'gp-exam', language: 'en', transcript: '38.5 °C', fields: ['gpVitals'], recordedAt: '2026-11-18T12:00:00Z' }];
  render(<ClinicalDictationButton kind="gp-visit" snapshot={snapshot} chartId="chart" chartSession={1} aiEnabled onApply={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button'));
  fireEvent.change(screen.getByLabelText(i18n.t('voice:clinical.transcript')), { target: { value: '38.5 °C' } });
  fireEvent.click(screen.getByRole('button', { name: i18n.t('voice:clinical.prepare') }));
  await screen.findByText(i18n.t('voice:clinical.checkTitle'));
  expect(screen.getByRole('button', { name: i18n.t('voice:clinical.checkDone') })).toBeVisible();
  expect(findUntranslated(document.body, ['38.5 °C'])).toEqual([]);
});
it('translates the proposal review shown when dictation would replace existing text', async () => {
  const snapshot = sampleOwnerReportSnapshot();
  snapshot.patientInfo.gpVitals = 'Existing vitals';
  render(<ClinicalDictationButton kind="gp-visit" snapshot={snapshot} chartId="chart" chartSession={1} aiEnabled onApply={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button'));
  fireEvent.change(screen.getByLabelText(i18n.t('voice:clinical.transcript')), { target: { value: '38.5 °C' } });
  fireEvent.click(screen.getByRole('button', { name: i18n.t('voice:clinical.prepare') }));
  await screen.findByRole('checkbox');
  expect(findUntranslated(document.body, ['38.5 °C', 'Existing vitals'])).toEqual([]);
});
it('translates the fixed CT capture dialog', () => {
  render(<ClinicalDictationButton kind="ct" snapshot={sampleOwnerReportSnapshot()} chartId={null} chartSession={1} aiEnabled onApply={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button'));
  expect(findUntranslated(document.body, ['38.5 °C'])).toEqual([]);
});
