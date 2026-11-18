import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../../i18n/testing/pseudo';
import i18n from '../../i18n';
import { PimsImages } from './PimsImages';
import type { ImageStore } from '../../utils/pims/images';
import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import type { ImageTransferTarget } from '../../utils/pims/imageTransfer';

beforeEach(async () => { vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true'); await installPseudoLocale(); });
afterEach(async () => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); await restoreLocale(); });
it('translates the mounted image review heading and shared review controls', () => {
  render(<PimsImages chartId={null} store={null} />);
  expect(screen.getByRole('heading', { name: i18n.t('pims:uploadReview.imageTitle') })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:uploadReview.open') }));
  expect(screen.getByText(i18n.t('pims:uploadReview.saveFirst'))).toBeInTheDocument();
  expect(findUntranslated(document.body)).toEqual([]);
});
it('translates preview, inclusion and removal in the automatic transfer flow', async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const bytes = new Uint8Array(33);
  bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
  const header = new DataView(bytes.buffer); header.setUint32(16,20); header.setUint32(20,10);
  const image = { id: 'image', chart_id: 'chart', path: 'owner/chart/image.png', caption: '', kind: 'xray' as const, original_path: 'owner/chart/original.dcm' };
  const store: ImageStore = {
    context: async () => ({ chart_id: 'chart', hash: 'a'.repeat(64), patient_name: 'Milo', patient_number: 'P-1' }),
    list: async () => [image], read: async () => image,
    download: async () => new NodeBlob([bytes], { type: 'image/png' }) as unknown as Blob,
  };
  const target: ImageTransferTarget = {
    provider: 'ezyvet', origin: 'https://clinic.ezyvet.com', tenant_id: 'clinic-1',
    connection_id: 'connection-1', connection_revision: 1, patient_id: 'patient-1',
    encounter_id: 'consult-1', destination: 'Medical', document_generation: 'document-1',
  };
  const transfer = { target, chart_link_version: 1, client: { rpc: vi.fn(async () => ({ data: null, error: null })) },
    provider: { readTarget: async () => target, readTargetNow: () => target, write: () => null, readSaved: async () => null } };
  render(<PimsImages chartId="chart" store={store} decode={async () => ({ width: 20, height: 10 })} canTransfer transfer={transfer} onTransferSelect={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:images.open') }));
  fireEvent.click(await screen.findByRole('button', { name: i18n.t('pims:images.preview') }));
  fireEvent.click(await screen.findByRole('button', { name: i18n.t('pims:images.includeTransfer') }));
  expect(findUntranslated(document.body, ['image'])).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:images.removeTransfer') }));
  expect(findUntranslated(document.body, ['image'])).toEqual([]);
});
it('translates missing cloud access and unsaved-chart notices', async () => {
  render(<PimsImages chartId={null} store={null} />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:images.open') }));
  await screen.findByRole('alert');
  expect(findUntranslated(document.body)).toEqual([]);
});
it('translates selection, image kinds and manual-only disclosure', async () => {
  const store: ImageStore = { context: async () => ({ chart_id: 'chart', hash: 'a'.repeat(64), patient_name: 'Milo', patient_number: 'P-1' }),
    list: async () => [{ id: 'image', chart_id: 'chart', path: 'owner/chart/image.png', caption: '', kind: 'xray', original_path: null }],
    read: async () => null, download: async () => { throw { code: 'forbidden' }; } };
  render(<PimsImages chartId="chart" store={store} canTransfer onTransferSelect={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:images.open') }));
  await screen.findByRole('button', { name: i18n.t('pims:images.preview') });
  expect(screen.getByText(i18n.t('pims:images.manual'))).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: i18n.t('pims:images.includeTransfer') })).not.toBeInTheDocument();
  expect(findUntranslated(document.body, ['image'])).toEqual([]);
});
