import { identifyPims } from '../../extension/pims/hosts';
import { renderSavedImage, revalidateImage, type ImageDecoder, type ImageStore, type PreparedImage } from './images';
import { pimsRolloutEnabled } from './rollout';
import type { RpcClient, SyncIdentity } from './sync';

export type ImageTransferTarget = SyncIdentity & {
  connection_id: string; patient_id: string; encounter_id: string; destination: string; document_generation: string;
};
export type ImageTransferProvider = {
  readTarget(): Promise<ImageTransferTarget | null>;
  readTargetNow(): ImageTransferTarget | null;
  write(input: { target: ImageTransferTarget; attempt_id: string; expires_at: string; content_hash: string; pngDataUrl: string }): { receipt: Promise<{ resource_id: string } | null> } | null;
  readSaved(resourceId: string): Promise<{ target: ImageTransferTarget; content_hash: string; saved: boolean } | null>;
};
export type ImageTransferResult = { state: 'blocked' }
  | { state: 'duplicate' | 'unknown'; attempt_id: string }
  | { state: 'confirmed'; attempt_id: string; resource_id: string };
const fields = ['connection_id', 'connection_revision', 'provider', 'origin', 'tenant_id', 'patient_id', 'encounter_id', 'destination', 'document_generation'] as const;
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
export function sameImageTransferTarget(observed: ImageTransferTarget | null, expected: ImageTransferTarget): boolean {
  return !!observed && fields.every(key => observed[key] === expected[key]);
}
export function validImageTransferTarget(target: ImageTransferTarget): boolean {
  try {
    const url = new URL(target.origin);
    return target.provider === 'ezyvet' && identifyPims(target.origin) === target.provider && url.origin === target.origin
      && !url.username && !url.password && url.protocol === 'https:' && !url.port
      && Number.isSafeInteger(target.connection_revision) && target.connection_revision > 0
      && fields.filter(key => key !== 'connection_revision').every(key => text(target[key]));
  } catch { return false; }
}
export async function transferReviewedImage(input: {
  target: ImageTransferTarget; prepared: PreparedImage; store: ImageStore; decode?: ImageDecoder;
  chart_link_version: number; client: RpcClient; provider: ImageTransferProvider; alive(): boolean;
}): Promise<ImageTransferResult> {
  let dispatched = false, attemptId: string | undefined, expires = Infinity;
  try {
    if (!pimsRolloutEnabled() || !input.alive() || !validImageTransferTarget(input.target) || !input.prepared.transfer
      || typeof input.provider.readSaved !== 'function' || typeof input.provider.readTargetNow !== 'function'
      || !Number.isSafeInteger(input.chart_link_version) || input.chart_link_version < 1) return { state: 'blocked' };
    const target = Object.freeze({ ...input.target });
    const prepared: PreparedImage = { ...input.prepared, image: { ...input.prepared.image }, source: { ...input.prepared.source }, transfer: { ...input.prepared.transfer } };
    const contentHash = prepared.transfer!.contentHash;
    const payload = { request_id: crypto.randomUUID(), connection_id: target.connection_id, connection_revision: target.connection_revision,
      chart_id: prepared.image.chart_id, chart_link_version: input.chart_link_version, image_id: prepared.image.id, source_hash: prepared.source.hash,
      patient_id: target.patient_id, encounter_id: target.encounter_id, destination: target.destination, document_generation: target.document_generation,
      content_hash: contentHash, content_bytes: prepared.transfer!.blob.size };
    const guard = async () => {
      if (!input.alive() || Date.now() >= expires) throw new TypeError();
      const observed = await input.provider.readTarget();
      if (!sameImageTransferTarget(observed, target) || !input.alive() || Date.now() >= expires) throw new TypeError();
    };
    const render = async () => {
      await guard();
      const result = await renderSavedImage(input.store, prepared, () => input.alive() && Date.now() < expires, input.decode);
      await guard();
      await revalidateImage(input.store, prepared, input.decode);
      if (!input.alive() || Date.now() >= expires) throw new TypeError();
      return result;
    };
    const invoke = async (name: string, body: unknown) => {
      if (!input.alive()) throw new TypeError();
      const result = await input.client.rpc(name, { payload: body });
      if (!input.alive() || result.error || !result.data || typeof result.data !== 'object') throw new TypeError();
      return result.data as Record<string, unknown>;
    };
    const matches = (value: unknown): value is Record<string, unknown> => {
      if (!value || typeof value !== 'object') return false;
      const attempt = value as Record<string, unknown>, identity = attempt.identity as SyncIdentity | undefined;
      return text(attempt.id) && Object.entries(payload).every(([key, expected]) => attempt[key] === expected)
        && identity?.provider === target.provider && identity.origin === target.origin && identity.tenant_id === target.tenant_id && identity.connection_revision === target.connection_revision;
    };
    await render();
    const reservation = await invoke('pims_prepare_image_transfer', payload);
    if (reservation.created === false && reservation.attempt && typeof reservation.attempt === 'object' && 'id' in reservation.attempt && text(reservation.attempt.id)) {
      return { state: 'duplicate', attempt_id: reservation.attempt.id };
    }
    if (reservation.created !== true || !matches(reservation.attempt) || reservation.attempt.state !== 'prepared' || typeof reservation.attempt.expires_at !== 'string') throw new TypeError();
    const attempt = reservation.attempt;
    expires = Date.parse(attempt.expires_at as string);
    if (!Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 300000) throw new TypeError();
    attemptId = attempt.id as string;
    await render();
    dispatched = true;
    const dispatch = await invoke('pims_dispatch_image_transfer', { attempt_id: attemptId });
    if (dispatch.execute !== true || !matches(dispatch.attempt) || dispatch.attempt.id !== attemptId || dispatch.attempt.state !== 'unknown') return { state: 'unknown', attempt_id: attemptId };
    const pngDataUrl = await render();
    if (!sameImageTransferTarget(input.provider.readTargetNow(), target) || !input.alive() || Date.now() >= expires) throw new TypeError();
    const pending = input.provider.write({ target, attempt_id: attemptId, expires_at: attempt.expires_at as string, content_hash: contentHash, pngDataUrl });
    if (!pending?.receipt) throw new TypeError();
    const receipt = await pending.receipt;
    await guard();
    if (!receipt || !text(receipt.resource_id)) throw new TypeError();
    const saved = await input.provider.readSaved(receipt.resource_id);
    await guard();
    if (!saved || saved.saved !== true || saved.content_hash !== contentHash || !sameImageTransferTarget(saved.target, target)) throw new TypeError();
    const confirmed = await invoke('pims_confirm_image_transfer', { attempt_id: attemptId, resource_id: receipt.resource_id, content_hash: contentHash });
    if (!matches(confirmed) || confirmed.id !== attemptId || confirmed.state !== 'confirmed' || confirmed.resource_id !== receipt.resource_id) throw new TypeError();
    await guard();
    return { state: 'confirmed', attempt_id: attemptId, resource_id: receipt.resource_id };
  } catch { return dispatched && attemptId ? { state: 'unknown', attempt_id: attemptId } : { state: 'blocked' }; }
}
