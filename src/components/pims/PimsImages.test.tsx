import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PimsImages } from './PimsImages';
import type { ImageStore } from '../../utils/pims/images';
import { transferReviewedImage, type ImageTransferTarget } from '../../utils/pims/imageTransfer';

vi.mock('../../utils/pims/imageTransfer', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../utils/pims/imageTransfer')>(),
  transferReviewedImage: vi.fn(),
}));

function binding() {
  const target: ImageTransferTarget = {
    provider: 'ezyvet', origin: 'https://clinic.ezyvet.com', tenant_id: 'clinic-1',
    connection_id: 'connection-1', connection_revision: 1, patient_id: 'patient-1',
    encounter_id: 'consult-1', destination: 'Medical', document_generation: 'document-1',
  };
  return {
    target, chart_link_version: 1,
    client: { rpc: vi.fn(async () => ({ data: null, error: null })) },
    provider: { readTarget: vi.fn(async () => target), readTargetNow: vi.fn(() => target), write: vi.fn(() => null), readSaved: vi.fn(async () => null) },
  };
}

const auth = vi.hoisted(() => {
  const listeners = new Set<(event: string) => void>();
  return { listeners, event: (event: string) => listeners.forEach(callback => callback(event)), unsubscribe: vi.fn(), rpc: vi.fn() };
});
vi.mock('../../utils/supabaseClient', () => ({ supabase: { rpc: auth.rpc, auth: { onAuthStateChange: (callback: (event: string) => void) => {
  auth.listeners.add(callback);
  return { data: { subscription: { unsubscribe: () => { auth.listeners.delete(callback); auth.unsubscribe(); } } } };
} } } }));

const image = { id: 'image-1', chart_id: 'chart-1', path: 'owner/chart-1/image.png', caption: 'Left side', kind: 'xray' as const, original_path: 'owner/chart-1/image.dcm' };
const source = { chart_id: 'chart-1', hash: 'a'.repeat(64), patient_name: 'Milo', patient_number: 'P-1' };
function fixture() {
  const bytes = new Uint8Array(33);
  bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
  const header = new DataView(bytes.buffer); header.setUint32(16,20); header.setUint32(20,10);
  const store: ImageStore = {
    context: vi.fn(async () => source), list: vi.fn(async () => [image]), read: vi.fn(async () => image),
    download: vi.fn(async () => new NodeBlob([bytes], { type: 'image/png' }) as unknown as Blob),
  };
  const decode = vi.fn(async () => ({ width: 20, height: 10 }));
  const download = vi.fn();
  return { store, decode, download, transfer: binding() };
}
beforeEach(() => {
  auth.rpc.mockReset().mockResolvedValue({ data: { rows: [], next_cursor: null }, error: null });
  vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true');
  vi.stubGlobal('crypto', webcrypto);
  vi.mocked(transferReviewedImage).mockReset();
  vi.mocked(transferReviewedImage).mockResolvedValue({ state: 'confirmed', attempt_id: 'attempt-1', resource_id: 'resource-1' });
  URL.createObjectURL = vi.fn(() => 'blob:preview'); URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function preview(props: ReturnType<typeof fixture>) {
  render(<PimsImages chartId="chart-1" {...props} />);
  expect(props.store.list).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Existing images' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Preview selected image' }));
  await screen.findByAltText('Selected saved image');
}
it('has no reads or UI while the rollout is off', () => {
  vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'false');
  const props = fixture(); const view = render(<PimsImages chartId="chart-1" {...props} />);
  expect(view.container).toBeEmptyDOMElement(); expect(props.store.context).not.toHaveBeenCalled();
  expect(auth.rpc).not.toHaveBeenCalled();
});
const reviewChart = '88888888-8888-4888-8888-888888888888';
it('mounts lazy image review without requiring automatic transfer or loading stored images', async () => {
  const props = fixture();
  render(<PimsImages chartId={reviewChart} {...props} />);
  expect(screen.getByRole('heading', { name: 'Uncertain image transfers' })).toBeInTheDocument();
  expect(auth.rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Review uncertain uploads' }));
  await screen.findByText('No uncertain uploads on this page.');
  expect(auth.rpc.mock.calls).toEqual([['pims_image_review_page', { payload: { chart_id: reviewChart } }]]);
  expect(props.store.context).not.toHaveBeenCalled();
  expect(props.store.list).not.toHaveBeenCalled();
});
it('records only a manual image observation through the mounted backend', async () => {
  const props = fixture();
  const attempt = '99999999-9999-4999-8999-999999999999';
  const connection = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const item = { kind: 'image', id: attempt, chart_id: reviewChart, connection_id: connection, connection_revision: 1,
    identity: { provider: 'ezyvet', origin: 'https://clinic.ezyvet.com', tenant_id: 'clinic-1', connection_revision: 1 },
    patient_id: 'patient-1', encounter_id: 'encounter-2', destination: 'Medical', document_generation: 'document-3',
    image_id: connection, content_hash: 'a'.repeat(64), dispatched_at: '2026-11-17T12:00:00Z', state: 'unknown', review_version: 0, observation: null };
  auth.rpc.mockResolvedValue({ data: { rows: [item], next_cursor: null }, error: null });
  render(<PimsImages chartId={reviewChart} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review uncertain uploads' }));
  await screen.findByLabelText('Your observation');
  expect(screen.getByText(`Saved image ID: ${connection}`)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Review note'), { target: { value: 'Checked original encounter' } });
  fireEvent.click(screen.getByRole('checkbox'));
  auth.rpc.mockImplementationOnce(async (_name, { payload }) => ({ data: { request_id: payload.request_id, chart_id: reviewChart,
    attempt_id: attempt, version: 1, observation: 'uncertain', note: payload.note, actor_id: connection, created_at: item.dispatched_at }, error: null }));
  fireEvent.click(screen.getByRole('button', { name: 'Record manual observation' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Automatic retry remains blocked');
  expect(auth.rpc.mock.calls.map(call => call[0])).toEqual(['pims_image_review_page', 'pims_record_image_observation', 'pims_image_review_page']);
  expect(auth.rpc.mock.calls[1][1]).toEqual({ payload: { chart_id: reviewChart, attempt_id: attempt, expected_version: 0,
    request_id: expect.any(String), observation: 'uncertain', note: 'Checked original encounter' } });
  expect(transferReviewedImage).not.toHaveBeenCalled();
  expect(props.transfer.provider.write).not.toHaveBeenCalled();
});
it.each(['SIGNED_OUT', 'SIGNED_IN', 'USER_UPDATED', 'chart', 'disabled', 'unmount', 'rollout'])
  ('discards pending image review after %s', async change => {
    const props = fixture();
    let resolve!: (value: any) => void;
    auth.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const view = render(<PimsImages chartId={reviewChart} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review uncertain uploads' }));
    expect(auth.rpc).toHaveBeenCalledTimes(1);
    if (change === 'chart') view.rerender(<PimsImages chartId="other" {...props} />);
    else if (change === 'disabled') view.rerender(<PimsImages chartId={reviewChart} {...props} disabled />);
    else if (change === 'unmount') view.unmount();
    else if (change === 'rollout') { vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'false'); view.rerender(<PimsImages chartId={reviewChart} {...props} />); }
    else act(() => auth.event(change));
    await act(async () => resolve({ data: { rows: [], next_cursor: null }, error: null }));
    expect(screen.queryByText('No uncertain uploads on this page.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reload uploads' })).not.toBeInTheDocument();
    expect(auth.rpc).toHaveBeenCalledTimes(1);
  });
it('requires preview and explicit inclusion before making an image available to Send', async () => {
  const props = fixture();
  const onTransferSelect = vi.fn();
  render(<PimsImages chartId="chart-1" {...props} canTransfer onTransferSelect={onTransferSelect} />);
  fireEvent.click(screen.getByRole('button', { name: 'Existing images' }));
  expect(screen.queryByRole('button', { name: 'Include in transfer' })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Preview selected image' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Include in transfer' }));
  expect(onTransferSelect.mock.lastCall?.[0]).toMatchObject({ chartId: 'chart-1', render: expect.any(Function), dispatch: expect.any(Function) });
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved images' }));
  expect(onTransferSelect.mock.lastCall?.[0]).toBeNull();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Preview selected image' })).toBeEnabled());
});
it('does not offer automatic image export without a supported extension destination', async () => {
  const props = fixture(); await preview(props);
  expect(screen.queryByRole('button', { name: 'Include in transfer' })).not.toBeInTheDocument();
});
it('keeps canTransfer without an observed binding manual-only', async () => {
  const props = fixture(); const onTransferSelect = vi.fn();
  render(<PimsImages chartId="chart-1" {...props} transfer={undefined} canTransfer onTransferSelect={onTransferSelect} />);
  fireEvent.click(screen.getByRole('button', { name: 'Existing images' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Preview selected image' }));
  await screen.findByAltText('Selected saved image');
  expect(screen.queryByRole('button', { name: 'Include in transfer' })).not.toBeInTheDocument();
  expect(onTransferSelect.mock.calls.every(([value]) => value === null)).toBe(true);
  expect(props.store.download).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Download for manual transfer' }));
  await waitFor(() => expect(props.download).toHaveBeenCalledOnce());
  expect(transferReviewedImage).not.toHaveBeenCalled();
});
it.each(['tenant', 'version', 'client', 'provider'] as const)('keeps an invalid %s binding manual-only', async (invalid) => {
  const props = fixture();
  if (invalid === 'tenant') props.transfer.target.tenant_id = '';
  if (invalid === 'version') props.transfer.chart_link_version = 0;
  if (invalid === 'client') Object.assign(props.transfer.client, { rpc: undefined });
  if (invalid === 'provider') Object.assign(props.transfer.provider, { readSaved: undefined });
  render(<PimsImages chartId="chart-1" {...props} canTransfer onTransferSelect={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Existing images' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Preview selected image' }));
  await screen.findByAltText('Selected saved image');
  expect(screen.queryByRole('button', { name: 'Include in transfer' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download for manual transfer' })).toBeEnabled();
});
async function includeImage() {
  const props = fixture(); const onTransferSelect = vi.fn();
  const view = render(<PimsImages chartId="chart-1" {...props} canTransfer onTransferSelect={onTransferSelect} />);
  fireEvent.click(screen.getByRole('button', { name: 'Existing images' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Preview selected image' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Include in transfer' }));
  return { props, onTransferSelect, view, included: onTransferSelect.mock.lastCall![0] };
}
it('dispatches the reviewed image through the coordinator with a snapshotted binding', async () => {
  const { props, included, view, onTransferSelect } = await includeImage();
  view.rerender(<PimsImages chartId="chart-1" {...props} canTransfer disabled onTransferSelect={onTransferSelect} />);
  let alive = true;
  await expect(included.dispatch('Medical', () => alive)).resolves.toEqual({ state: 'confirmed', attempt_id: 'attempt-1', resource_id: 'resource-1' });
  expect(transferReviewedImage).toHaveBeenCalledOnce();
  const input = vi.mocked(transferReviewedImage).mock.calls[0][0];
  expect(input).toMatchObject({ target: props.transfer.target, chart_link_version: 1 });
  expect(input.target).not.toBe(props.transfer.target);
  expect(Object.isFrozen(input.target)).toBe(true);
  expect(input.store).toBe(props.store);
  expect(input.decode).toBe(props.decode);
  expect(input.client).toBe(props.transfer.client);
  expect(input.provider).toBe(props.transfer.provider);
  expect(input.prepared.transfer?.blob).toBe(vi.mocked(URL.createObjectURL).mock.lastCall![0]);
  expect(input.alive()).toBe(true);
  alive = false;
  expect(input.alive()).toBe(false);
});
it('blocks a different destination or a dead caller before coordinator invocation', async () => {
  const { included } = await includeImage();
  await expect(included.dispatch('Other field', () => true)).resolves.toEqual({ state: 'blocked' });
  await expect(included.dispatch('Medical', () => false)).resolves.toEqual({ state: 'blocked' });
  expect(transferReviewedImage).not.toHaveBeenCalled();
});
it.each(['tenant', 'patient', 'encounter', 'destination', 'generation', 'revision', 'connection', 'origin', 'providerId', 'version', 'client', 'provider', 'absent'] as const)(
  'invalidates inclusion when binding %s changes while canTransfer remains true', async (change) => {
    const { props, view, included, onTransferSelect } = await includeImage();
    const transfer = { ...props.transfer, target: { ...props.transfer.target } };
    if (change === 'tenant') transfer.target.tenant_id = 'clinic-2';
    if (change === 'patient') transfer.target.patient_id = 'patient-2';
    if (change === 'encounter') transfer.target.encounter_id = 'consult-2';
    if (change === 'destination') transfer.target.destination = 'Other field';
    if (change === 'generation') transfer.target.document_generation = 'document-2';
    if (change === 'revision') transfer.target.connection_revision++;
    if (change === 'connection') transfer.target.connection_id = 'connection-2';
    if (change === 'origin') transfer.target.origin = 'https://other.ezyvet.com';
    if (change === 'providerId') transfer.target.provider = 'pulse';
    if (change === 'version') transfer.chart_link_version++;
    if (change === 'client') transfer.client = binding().client;
    if (change === 'provider') transfer.provider = binding().provider;
    view.rerender(<PimsImages chartId="chart-1" {...props} transfer={change === 'absent' ? undefined : transfer} canTransfer onTransferSelect={onTransferSelect} />);
    expect(onTransferSelect.mock.lastCall![0]).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove from transfer' })).not.toBeInTheDocument();
    await expect(included.dispatch('Medical', () => true)).resolves.toEqual({ state: 'blocked' });
    await expect(included.render()).rejects.toMatchObject({ code: 'stale' });
    expect(transferReviewedImage).not.toHaveBeenCalled();
  },
);
it('does not invalidate an equivalent binding recreated by its parent', async () => {
  const { props, view, included, onTransferSelect } = await includeImage();
  view.rerender(<PimsImages chartId="chart-1" {...props} transfer={{ ...props.transfer, target: { ...props.transfer.target } }} canTransfer onTransferSelect={onTransferSelect} />);
  expect(onTransferSelect.mock.lastCall![0]).toBe(included);
  await expect(included.dispatch('Medical', () => true)).resolves.toMatchObject({ state: 'confirmed' });
});
it('detects a mutated binding without forwarding it to the coordinator', async () => {
  const { props, included } = await includeImage();
  props.transfer.target.patient_id = 'patient-2';
  await expect(included.dispatch('Medical', () => true)).resolves.toEqual({ state: 'blocked' });
  expect(transferReviewedImage).not.toHaveBeenCalled();
});
it.each(['removal', 'reload', 'selection', 'store', 'chart', 'auth', 'unmount', 'capability'] as const)(
  'revokes coordinator lifetime after %s changes', async (change) => {
    const { props, included, view, onTransferSelect } = await includeImage();
    await included.dispatch('Medical', () => true);
    const input = vi.mocked(transferReviewedImage).mock.calls[0][0];
    expect(input.alive()).toBe(true);
    if (change === 'removal') fireEvent.click(screen.getByRole('button', { name: 'Remove from transfer' }));
    if (change === 'reload') await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reload saved images' })); });
    if (change === 'selection') fireEvent.change(screen.getByRole('combobox'), { target: { value: 'image-1' } });
    if (change === 'store') view.rerender(<PimsImages chartId="chart-1" {...props} store={{ ...props.store }} canTransfer onTransferSelect={onTransferSelect} />);
    if (change === 'chart') view.rerender(<PimsImages chartId="chart-2" {...props} canTransfer onTransferSelect={onTransferSelect} />);
    if (change === 'auth') act(() => auth.event('SIGNED_OUT'));
    if (change === 'unmount') view.unmount();
    if (change === 'capability') view.rerender(<PimsImages chartId="chart-1" {...props} canTransfer={false} onTransferSelect={onTransferSelect} />);
    expect(input.alive()).toBe(false);
    await expect(included.dispatch('Medical', () => true)).resolves.toEqual({ state: 'blocked' });
    expect(transferReviewedImage).toHaveBeenCalledOnce();
    if (change === 'reload') await waitFor(() => expect(screen.getByRole('button', { name: 'Preview selected image' })).toBeEnabled());
  },
);
it.each(['binding', 'auth', 'unmount', 'caller'] as const)('revokes an in-flight coordinator after %s changes', async (change) => {
  const { props, included, view, onTransferSelect } = await includeImage();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  vi.mocked(transferReviewedImage).mockImplementationOnce(async input => {
    await pending;
    return input.alive() ? { state: 'confirmed', attempt_id: 'attempt-1', resource_id: 'resource-1' } : { state: 'blocked' };
  });
  let alive = true;
  const dispatch = included.dispatch('Medical', () => alive);
  if (change === 'binding') view.rerender(<PimsImages chartId="chart-1" {...props} transfer={{ ...props.transfer, chart_link_version: 2 }} canTransfer onTransferSelect={onTransferSelect} />);
  if (change === 'auth') act(() => auth.event('SIGNED_OUT'));
  if (change === 'unmount') view.unmount();
  if (change === 'caller') alive = false;
  release();
  await expect(dispatch).resolves.toEqual({ state: 'blocked' });
});
it('previews the converted PNG before inclusion and reuses those exact bytes on send', async () => {
  const props = fixture(); const onTransferSelect = vi.fn();
  const png = await props.store.download(image.path);
  const jpeg = new NodeBlob([new Uint8Array([255,216,255,192,0,17,8,0,10,0,20,3,1,17,0,2,17,0,3,17,0,255,217,0])], { type: 'image/jpeg' }) as unknown as Blob;
  vi.mocked(props.store.download).mockResolvedValue(jpeg);
  const bitmap = { width: 20, height: 10, close: vi.fn() };
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(done => done(png));
  try {
    render(<PimsImages chartId="chart-1" {...props} canTransfer onTransferSelect={onTransferSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Existing images' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Preview selected image' }));
    await screen.findByAltText('Selected saved image');
    expect(URL.createObjectURL).toHaveBeenLastCalledWith(png);
    fireEvent.click(screen.getByRole('button', { name: 'Include in transfer' }));
    await expect(onTransferSelect.mock.lastCall![0].render()).resolves.toBe(`data:image/png;base64,${Buffer.from(await png.arrayBuffer()).toString('base64')}`);
    await onTransferSelect.mock.lastCall![0].dispatch('Medical', () => true);
    expect(vi.mocked(transferReviewedImage).mock.calls[0][0].prepared.transfer?.blob).toBe(png);
    expect(encode).toHaveBeenCalledOnce();
  } finally { context.mockRestore(); encode.mockRestore(); }
});
it('renders the included image while Send disables controls, then invalidates it on removal', async () => {
  const props = fixture(); const onTransferSelect = vi.fn();
  const view = render(<PimsImages chartId="chart-1" {...props} canTransfer onTransferSelect={onTransferSelect} />);
  fireEvent.click(screen.getByRole('button', { name: 'Existing images' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Preview selected image' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Include in transfer' }));
  const included = onTransferSelect.mock.lastCall![0];
  view.rerender(<PimsImages chartId="chart-1" {...props} canTransfer disabled onTransferSelect={onTransferSelect} />);
  expect(screen.getByRole('button', { name: 'Remove from transfer' })).toBeDisabled();
  await expect(included.render()).resolves.toMatch(/^data:image\/png;base64,/);
  view.rerender(<PimsImages chartId="chart-1" {...props} canTransfer onTransferSelect={onTransferSelect} />);
  fireEvent.click(screen.getByRole('button', { name: 'Remove from transfer' }));
  expect(onTransferSelect.mock.lastCall![0]).toBeNull();
  await expect(included.render()).rejects.toMatchObject({ code: 'stale' });
});
it.each(['provider', 'auth', 'unmount'] as const)('invalidates an included image after %s changes', async (change) => {
  const props = fixture(); const onTransferSelect = vi.fn();
  const view = render(<PimsImages chartId="chart-1" {...props} canTransfer onTransferSelect={onTransferSelect} />);
  fireEvent.click(screen.getByRole('button', { name: 'Existing images' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Preview selected image' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Include in transfer' }));
  const included = onTransferSelect.mock.lastCall![0];
  if (change === 'provider') view.rerender(<PimsImages chartId="chart-1" {...props} onTransferSelect={onTransferSelect} />);
  if (change === 'auth') act(() => auth.event('SIGNED_OUT'));
  if (change === 'unmount') view.unmount();
  expect(onTransferSelect.mock.lastCall![0]).toBeNull();
  await expect(included.render()).rejects.toMatchObject({ code: 'stale' });
});
it('removes a stale preview when automatic transfer revalidation fails', async () => {
  const props = fixture(); const onTransferSelect = vi.fn();
  render(<PimsImages chartId="chart-1" {...props} canTransfer onTransferSelect={onTransferSelect} />);
  fireEvent.click(screen.getByRole('button', { name: 'Existing images' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Preview selected image' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Include in transfer' }));
  const included = onTransferSelect.mock.lastCall![0];
  vi.mocked(props.store.context).mockResolvedValue({ ...source, hash: 'b'.repeat(64) });
  await act(async () => { await expect(included.render()).rejects.toMatchObject({ code: 'stale' }); });
  expect(screen.queryByAltText('Selected saved image')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('The saved chart or image changed');
  expect(onTransferSelect.mock.lastCall![0]).toBeNull();
});
it('previews the original stored image and reauthorizes before manual download', async () => {
  const props = fixture(); await preview(props);
  expect(screen.getByText(/DICOM-derived preview/)).toBeInTheDocument();
  expect(props.download).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Download for manual transfer' }));
  await waitFor(() => expect(props.download).toHaveBeenCalledOnce());
  expect(props.store.download).toHaveBeenCalledTimes(2);
  expect(props.store.context).toHaveBeenCalledTimes(6);
  expect(props.download.mock.calls[0][1]).toBe('ToothOps-preview-image-1.png');
  expect(screen.getByRole('status')).toHaveTextContent('Download requested');
});
it('invalidates reviewed bytes when the saved chart changes before download', async () => {
  const props = fixture(); await preview(props);
  vi.mocked(props.store.context).mockResolvedValue({ ...source, hash: 'b'.repeat(64) });
  fireEvent.click(screen.getByRole('button', { name: 'Download for manual transfer' }));
  await screen.findByRole('alert');
  expect(props.download).not.toHaveBeenCalled();
  expect(screen.queryByAltText('Selected saved image')).not.toBeInTheDocument();
});
it('clears clinical previews immediately on sign-out and discards pending exports', async () => {
  const props = fixture(); await preview(props);
  let resolve!: (value: typeof source) => void;
  vi.mocked(props.store.context).mockImplementationOnce(() => new Promise<typeof source>((done) => { resolve = done; }));
  fireEvent.click(screen.getByRole('button', { name: 'Download for manual transfer' }));
  act(() => auth.event('SIGNED_OUT'));
  expect(screen.queryByAltText('Selected saved image')).not.toBeInTheDocument();
  await act(async () => { resolve(source); });
  expect(props.download).not.toHaveBeenCalled();
});
it('drops pending work when the chart changes', async () => {
  const props = fixture(); let resolve!: (value: typeof source) => void;
  props.store.context = vi.fn(() => new Promise<typeof source>((done) => { resolve = done; }));
  const view = render(<PimsImages chartId="chart-1" {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Existing images' }));
  view.rerender(<PimsImages chartId="chart-2" {...props} />);
  resolve(source);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Preview selected image' })).not.toBeInTheDocument());
  expect(props.download).not.toHaveBeenCalled();
});
it('does not export after the parent disables transfers during revalidation', async () => {
  const props = fixture();
  const view = render(<PimsImages chartId="chart-1" {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Existing images' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Preview selected image' }));
  await screen.findByAltText('Selected saved image');
  let resolve!: (value: typeof source) => void;
  vi.mocked(props.store.context).mockImplementationOnce(() => new Promise<typeof source>((done) => { resolve = done; }));
  fireEvent.click(screen.getByRole('button', { name: 'Download for manual transfer' }));
  view.rerender(<PimsImages chartId="chart-1" disabled {...props} />);
  resolve(source);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download for manual transfer' })).toBeDisabled());
  await waitFor(() => expect(props.store.download).toHaveBeenCalledTimes(2));
  expect(props.download).not.toHaveBeenCalled();
});

it('offers the reviewed editor compatibility path without a strict readback binding', async () => {
  const props = fixture(), onTransferSelect = vi.fn();
  render(<PimsImages chartId="chart-1" {...props} transfer={undefined} canTransfer editorTransfer onTransferSelect={onTransferSelect} />);
  fireEvent.click(screen.getByRole('button', { name: 'Existing images' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Preview selected image' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Include in transfer' }));
  const included = onTransferSelect.mock.lastCall![0];
  expect(included).toMatchObject({ chartId: 'chart-1', editorTransfer: true, render: expect.any(Function) });
  expect(included.dispatch).toBeUndefined();
  expect(await included.render()).toMatch(/^data:image\/png;base64,/);
  expect(transferReviewedImage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved images' }));
  await expect(included.render()).rejects.toBeDefined();
});
