import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../../i18n/testing/pseudo';
import i18n from '../../i18n';
import { PimsDrafts } from './PimsDrafts';
import type { DraftBackend } from '../../utils/pims/drafts';

beforeEach(async () => { vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true'); await installPseudoLocale(); });
afterEach(async () => { cleanup(); vi.unstubAllEnvs(); await restoreLocale(); });
it('translates missing-storage and unsaved-chart notices', async () => {
  render(<PimsDrafts chartId="chart" backend={null} />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:drafts.open') }));
  await screen.findByRole('alert');
  expect(findUntranslated(document.body)).toEqual([]);
});
it('translates draft composition, review, transfer and source labels', async () => {
  const backend = { context: async () => ({ source: { chart_id: 'chart', practice_id: 'practice', patient_name: 'Milo',
    patient_number: 'P-1', chart_date: '2026-11-16', updated_at: '2026-11-16T12:00:00Z', hash: 'a'.repeat(64), data: {} }, drafts: [] }) } as unknown as DraftBackend;
  render(<PimsDrafts chartId="chart" backend={backend} />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:drafts.open') }));
  await screen.findByLabelText(i18n.t('pims:drafts.body'));
  expect(findUntranslated(document.body, ['English', 'Français', 'Deutsch', 'Italiano', 'Español'])).toEqual([]);
});
