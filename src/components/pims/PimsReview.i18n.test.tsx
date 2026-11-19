import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../../i18n/testing/pseudo';
import i18n from '../../i18n';
import { PimsReview } from './PimsReview';
import type { ReviewBackend } from '../../utils/pims/review';

beforeEach(async () => { vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true'); await installPseudoLocale(); });
afterEach(async () => { cleanup(); vi.unstubAllEnvs(); await restoreLocale(); });
it('translates the empty review and missing-server state', async () => {
  render(<PimsReview backend={null} />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:review.open') }));
  await screen.findByRole('alert');
  expect(findUntranslated(document.body)).toEqual([]);
});
it('translates review actions and identity comparisons', async () => {
  const backend = {
    connections: async () => [{ id: 'connection', provider: 'ezyvet', tenant_id: 'clinic', practice_name: 'Practice', state: 'active' }],
    page: async () => ({ rows: [{ id: 'issue', appointment_id: 'Appointment', reason: 'identity_changed', proposed: {}, current: null }], next_cursor: null }),
  } as unknown as ReviewBackend;
  render(<PimsReview backend={backend} />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:review.open') }));
  await screen.findByText('Appointment');
  expect(findUntranslated(document.body, ['Appointment', 'Practice', 'ezyvet', 'clinic'])).toEqual([]);
});
