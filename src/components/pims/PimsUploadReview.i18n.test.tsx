import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../../i18n/testing/pseudo';
import i18n from '../../i18n';
import { PimsUploadReview } from './PimsUploadReview';
import type { UploadReviewBackend, UploadReviewItem } from '../../utils/pims/uploadReview';

beforeEach(async () => { vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true'); await installPseudoLocale(); });
afterEach(async () => { cleanup(); vi.unstubAllEnvs(); await restoreLocale(); });
it('translates the schema and unsaved-chart notices', async () => {
  render(<PimsUploadReview chartId="chart" backend={null} />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:uploadReview.open') }));
  await screen.findByRole('alert');
  expect(findUntranslated(document.body)).toEqual([]);
});
it('translates target, manual observation and duplicate-warning labels', async () => {
  const observation = { request_id: 'request', chart_id: 'chart', attempt_id: 'attempt', version: 1, observation: 'present' as const,
    note: 'Clinician-entered observation', actor_id: 'reviewer', created_at: '2026-11-17T12:00:00Z' };
  const item: UploadReviewItem = { id: 'attempt', chart_id: 'chart', connection_id: 'connection', connection_revision: 2,
    identity: { provider: 'instinct', origin: 'https://clinic.instinctvet.cloud', tenant_id: 'clinic', connection_revision: 2 },
    patient_id: 'patient', location_id: 'location', draft_id: 'draft', draft_version: 2, content_hash: 'a'.repeat(64),
    dispatched_at: '2026-11-17T12:00:00Z', state: 'unknown', review_version: 1, observation };
  const backend: UploadReviewBackend = { page: async () => ({ rows: [item], next_cursor: null }), observe: async () => observation };
  render(<PimsUploadReview chartId="chart" backend={backend} />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:uploadReview.open') }));
  await screen.findByLabelText(i18n.t('pims:uploadReview.observation'));
  expect(findUntranslated(document.body, [observation.note])).toEqual([]);
});
