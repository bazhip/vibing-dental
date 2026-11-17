import React from 'react';
import { useTranslation } from 'react-i18next';
import { pimsRolloutEnabled } from '../../utils/pims/rollout';
import { defaultImageStore } from '../../utils/pims/imageStore';
import { sameImageTransferTarget, transferReviewedImage, validImageTransferTarget, type ImageTransferProvider, type ImageTransferTarget } from '../../utils/pims/imageTransfer';
import type { RpcClient } from '../../utils/pims/sync';
import { imageError, prepareImage, prepareImageTransfer, revalidateImage, renderSavedImage, validSavedImage, type ImageDecoder, type ImageError, type ImageStore, type PreparedImage, type SavedImage, type SelectedImageTransfer } from '../../utils/pims/images';
import { isInAppBrowser } from '../../utils/savePdf';
import { supabase } from '../../utils/supabaseClient';
import './PimsDrafts.css';
import './PimsImages.css';

type Props = {
  chartId: string | null; disabled?: boolean; store?: ImageStore | null; decode?: ImageDecoder;
  download?: (blob: Blob, filename: string) => void;
  canTransfer?: boolean;
  transfer?: { target: ImageTransferTarget; chart_link_version: number; client: RpcClient; provider: ImageTransferProvider };
  onTransferSelect?: (image: SelectedImageTransfer | null) => void;
};
function validTransferBinding(transfer: Props['transfer']): transfer is NonNullable<Props['transfer']> {
  return !!transfer && validImageTransferTarget(transfer.target)
    && Number.isSafeInteger(transfer.chart_link_version) && transfer.chart_link_version > 0
    && typeof transfer.client?.rpc === 'function' && typeof transfer.provider?.readTarget === 'function' && typeof transfer.provider?.readTargetNow === 'function'
    && typeof transfer.provider?.write === 'function' && typeof transfer.provider?.readSaved === 'function';
}
function downloadImage(blob: Blob, filename: string): void {
  if (isInAppBrowser()) throw { code: 'unsupported' };
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  try { anchor.click(); } finally {
    anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
export function PimsImages(props: Props): React.ReactElement | null {
  return pimsRolloutEnabled() ? <EnabledPimsImages key={props.chartId} {...props} /> : null;
}
function EnabledPimsImages({ chartId, disabled = false, store = defaultImageStore, decode, download = downloadImage, canTransfer = false, transfer, onTransferSelect }: Props): React.ReactElement {
  const { t } = useTranslation('pims');
  const [expanded, setExpanded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [images, setImages] = React.useState<SavedImage[]>([]);
  const [selected, setSelected] = React.useState('');
  const [prepared, setPrepared] = React.useState<PreparedImage | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState('');
  const [error, setError] = React.useState<ImageError | 'save' | null>(null);
  const [requested, setRequested] = React.useState(false);
  const [included, setIncluded] = React.useState(false);
  const selection = React.useRef(onTransferSelect);
  selection.current = onTransferSelect;
  const transferEnabled = canTransfer && validTransferBinding(transfer);
  const transferAllowed = React.useRef(transferEnabled);
  transferAllowed.current = transferEnabled;
  const activeBinding = React.useRef(transfer);
  activeBinding.current = transfer;
  const target = transfer?.target;
  const bindingKey = JSON.stringify([target?.provider, target?.origin, target?.tenant_id, target?.connection_id,
    target?.connection_revision, target?.patient_id, target?.encounter_id, target?.destination,
    target?.document_generation, transfer?.chart_link_version]);
  const transferRevision = React.useRef(0);
  const clearTransfer = React.useCallback(() => { transferRevision.current++; setIncluded(false); selection.current?.(null); }, []);
  const sequence = React.useRef(0);
  const allowed = React.useRef(!disabled);
  const activeStore = React.useRef(store);
  allowed.current = !disabled;
  activeStore.current = store;
  const reset = React.useCallback(() => {
    clearTransfer();
    sequence.current++; setExpanded(false); setBusy(false); setImages([]); setSelected('');
    setPrepared(null); setPreviewUrl(''); setError(null); setRequested(false);
  }, [clearTransfer]);
  React.useEffect(() => { reset(); return () => { sequence.current++; selection.current?.(null); }; }, [store, reset]);
  React.useEffect(() => { clearTransfer(); }, [transferEnabled, bindingKey, transfer?.client, transfer?.provider, clearTransfer]);
  React.useEffect(() => {
    const subscription = supabase?.auth?.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') reset();
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, [reset]);
  React.useEffect(() => {
    if (!prepared) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(prepared.transfer?.blob ?? prepared.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [prepared]);
  const current = (request: number) => request === sequence.current && allowed.current && activeStore.current === store;
  const load = async () => {
    if (busy || disabled) return;
    clearTransfer();
    setExpanded(true); setPrepared(null); setRequested(false); setError(null); setImages([]); setSelected('');
    if (!chartId || !store) { setError(chartId ? 'schema' : 'save'); return; }
    const request = ++sequence.current;
    setBusy(true);
    try {
      const source = await store.context(chartId);
      if (!current(request)) return;
      const rows = await store.list(chartId);
      if (!current(request)) return;
      const latest = await store.context(chartId);
      if (!current(request)) return;
      if (source.chart_id !== chartId || latest.chart_id !== chartId || source.hash !== latest.hash) throw { code: 'stale' };
      if (rows.length > 30 || rows.some((image) => !validSavedImage(image, chartId)) || new Set(rows.map((image) => image.id)).size !== rows.length) throw { code: 'invalid' };
      setImages(rows); setSelected(rows[0]?.id ?? '');
    } catch (cause) { if (current(request)) setError(imageError(cause)); }
    finally { if (request === sequence.current) setBusy(false); }
  };
  const preview = async () => {
    if (busy || disabled || !store || !chartId || !selected) return;
    clearTransfer();
    const request = ++sequence.current;
    setBusy(true); setPrepared(null); setError(null); setRequested(false);
    try {
      const source = await prepareImage(store, chartId, selected, decode);
      const result = transferEnabled ? await prepareImageTransfer(store, source, () => current(request) && transferAllowed.current, decode) : source;
      if (current(request)) setPrepared(result);
    } catch (cause) { if (current(request)) setError(imageError(cause)); }
    finally { if (request === sequence.current) setBusy(false); }
  };
  const exportImage = async () => {
    if (busy || disabled || !prepared || !store) return;
    clearTransfer();
    const request = ++sequence.current;
    setBusy(true); setError(null); setRequested(false);
    try {
      const result = await revalidateImage(store, prepared, decode);
      if (!current(request)) return;
      const identifier = result.image.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      download(result.blob, `ToothOps-${result.dicomPreview ? 'preview' : 'image'}-${identifier}.${result.extension}`);
      setRequested(true);
    } catch (cause) { if (current(request)) { setPrepared(null); setError(imageError(cause)); } }
    finally { if (request === sequence.current) setBusy(false); }
  };
  return <section className="pims-drafts" aria-label={t('images.open')}>
    <button type="button" disabled={disabled || busy} aria-expanded={expanded} onClick={() => expanded ? setExpanded(false) : void load()}>{t('images.open')}</button>
    {expanded && <div className="pims-images__body" aria-busy={busy}>
      <p>{t(transferEnabled ? 'images.transferHelp' : 'images.manual')}</p>
      {error && <p role="alert">{t(`images.errors.${error}`)}</p>}
      {busy && <p role="status">{t('images.loading')}</p>}
      {requested && <p role="status">{t('images.requested')}</p>}
      <button type="button" disabled={disabled || busy} onClick={() => void load()}>{t('images.reload')}</button>
      {!busy && !error && !images.length && <p>{t('images.empty')}</p>}
      {!!images.length && <>
        <label>{t('images.select')}<select disabled={disabled || busy} value={selected} onChange={(event) => { clearTransfer(); sequence.current++; setSelected(event.target.value); setPrepared(null); setRequested(false); setError(null); }}>
          {images.map((image) => <option key={image.id} value={image.id}>{t(`images.kinds.${image.kind}`)} · {image.caption || image.id}</option>)}
        </select></label>
        <button type="button" className={prepared ? undefined : 'pims-drafts__primary'} disabled={disabled || busy || !selected} onClick={() => void preview()}>{t('images.preview')}</button>
      </>}
      {prepared && previewUrl && <div className="pims-images__preview">
        <p>{t('images.source', { patient: prepared.source.patient_name, number: prepared.source.patient_number, chart: prepared.source.chart_id })}</p>
        <p>{t('images.dimensions', { width: prepared.width, height: prepared.height, format: prepared.transfer ? 'PNG' : prepared.extension.toUpperCase() })}</p>
        {prepared.dicomPreview && <p>{t('images.dicom')}</p>}
        <img src={previewUrl} alt={t('images.alt')} />
        {transferEnabled && prepared.transfer && onTransferSelect && <>
          <button type="button" disabled={disabled || busy} onClick={() => {
            if (included) { clearTransfer(); return; }
            if (!store || !chartId || disabled || busy || !transferAllowed.current || !validTransferBinding(transfer)) return;
            const request = sequence.current;
            const revision = transferRevision.current;
            const binding = { ...transfer, target: Object.freeze({ ...transfer.target }) };
            const valid = () => revision === transferRevision.current && request === sequence.current && transferAllowed.current && activeStore.current === store
              && validTransferBinding(activeBinding.current) && sameImageTransferTarget(activeBinding.current.target, binding.target)
              && activeBinding.current.chart_link_version === binding.chart_link_version
              && activeBinding.current.client === binding.client && activeBinding.current.provider === binding.provider;
            onTransferSelect({ chartId, dispatch: async (destination, alive) => {
              const active = () => alive() && valid();
              if (destination !== binding.target.destination || !active()) return { state: 'blocked' };
              return transferReviewedImage({ ...binding, prepared, store, decode, alive: active });
            }, render: async () => {
              try { return await renderSavedImage(store, prepared, valid, decode); }
              catch (cause) {
                if (valid()) { clearTransfer(); setPrepared(null); setError(imageError(cause)); }
                throw cause;
              }
            } });
            setIncluded(true);
          }}>{t(included ? 'images.removeTransfer' : 'images.includeTransfer')}</button>
          {included && <p role="status">{t('images.included')}</p>}
        </>}
        <button type="button" className={transferEnabled ? undefined : 'pims-drafts__primary'} disabled={disabled || busy} onClick={() => void exportImage()}>{t('images.download')}</button>
      </div>}
    </div>}
  </section>;
}
