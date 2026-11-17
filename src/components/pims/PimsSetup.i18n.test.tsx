import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../../i18n/testing/pseudo';
import i18n from '../../i18n';
import { PimsSetup } from './PimsSetup';
import type { SetupBackend } from '../../utils/pims/setup';

beforeEach(async () => { vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true'); await installPseudoLocale(); });
afterEach(async () => { cleanup(); vi.unstubAllEnvs(); await restoreLocale(); });
it('translates setup forms, instructions and confirmation', async () => {
  const backend = { context: async () => ({ connections: [], members: [] }) } as unknown as SetupBackend;
  render(<PimsSetup practiceId="practice" owner backend={backend} />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:setup.open') }));
  await screen.findByText(i18n.t('pims:setup.emptyConnections'));
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:setup.add') }));
  expect(findUntranslated(document.body)).toEqual([]);
  fireEvent.change(screen.getByLabelText(i18n.t('pims:setup.origin')), { target: { value: 'https://clinic.ezyvet.com' } });
  fireEvent.change(screen.getByLabelText(i18n.t('pims:setup.tenant')), { target: { value: 'Clinic' } });
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:setup.reviewConnection') }));
  expect(findUntranslated(document.body, ['https://clinic.ezyvet.com · Clinic'])).toEqual([]);
});
it('translates missing schema errors', async () => {
  render(<PimsSetup practiceId="practice" owner backend={null} />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:setup.open') }));
  await screen.findByRole('alert');
  expect(findUntranslated(document.body)).toEqual([]);
});
it('translates provider verification and sync controls', async () => {
  const backend = { context: async () => ({ connections: [{ id: 'connection', provider: 'rhapsody', origin: 'https://clinic.rhapsody.vet', tenant_id: 'business', state: 'active', revision: 1 }], members: [] }),
    page: async () => ({ rows: [], next_cursor: null }) } as unknown as SetupBackend;
  render(<PimsSetup practiceId="practice" owner backend={backend} />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:setup.open') }));
  await screen.findByRole('button', { name: i18n.t('pims:setup.verifyBrowser') });
  expect(findUntranslated(document.body)).toEqual([]);
});
