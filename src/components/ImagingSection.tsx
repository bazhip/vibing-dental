import { SectionHeader } from './SectionHeader';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { confirmDialog, friendlyError } from './ui/dialogs';
import { errorText } from '../utils/apiErrors';
import { useAttachments, AttachmentKind } from '../hooks/useAttachments';
import { ImageRole, Species } from '../types';
import { ImageViewer } from './ImageViewer';
import { imageTeeth, imageToothLabel } from '../utils/imageTeeth';
import { isNativeApp } from '../native/platform';
import { takePhoto } from '../native/camera';
import { useMediaQuery } from '../ios/gesture';
import './ImagingUpload.css';

interface ImagingSectionProps {
  /** The active chart's cloud id — attachments are scoped to it. */
  chartId: string;
  /** False in trial/standalone: no account to scope private storage to. */
  cloudActive: boolean;
  /** Stamp new images with the practice so teammates can see them. */
  practiceId?: string;
  /** Per-plan cap on images for this chart. */
  maxImages?: number;
  /** Paid plans: accept DICOM radiographs (original kept for download). */
  dicomEnabled?: boolean;
  /** Owner-report before/after tags (attachment id → role). */
  imageRoles?: Record<string, ImageRole>;
  /** Tag (or untag, with null) an image for the owner report. */
  onImageRoleChange?: (attachmentId: string, role: ImageRole | null) => void;
  /** Append this chart's images to the PDF as extra pages (4 per page). */
  includeInPdf?: boolean;
  onIncludeInPdfChange?: (include: boolean) => void;
  /** Image ids unticked for the PDF; everything else goes in. */
  pdfExcludedImages?: string[];
  onImageInPdfChange?: (attachmentId: string, include: boolean) => void;
  /** View-only (saved visit not unlocked): images open, nothing changes. */
  readOnly?: boolean;
  /** Open this page's settings (e.g. images in the PDF). */
  onCustomize?: () => void;
  /** Invalidate report review when attachment content is edited. */
  onReportContentChange?: () => void;
  /** The chart's species: which teeth an image can be pinned to. */
  species?: Species;
}

type QueueItem = { key: string; name: string; status: 'waiting' | 'uploading' | 'failed'; error?: string };

/** Files from a drop or paste. Anything that isn't an image is turned
 *  down per file by the upload checks, with the reason shown. */
function filesFrom(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []);
}

const KINDS: AttachmentKind[] = ['photo', 'xray'];
const ROLES: ImageRole[] = ['before', 'after'];

/**
 * Photos & radiographs for the chart. Upload intraoral photos or dental
 * rads, caption them, and optionally anchor each to a tooth (Triadan).
 * Images live in a private bucket and render via short-lived signed
 * URLs. Cloud-only — the section explains itself in trial/standalone.
 */
export const ImagingSection: React.FC<ImagingSectionProps> = ({
  chartId,
  cloudActive,
  practiceId = '',
  maxImages,
  dicomEnabled = false,
  imageRoles = {},
  onImageRoleChange,
  includeInPdf = true,
  onIncludeInPdfChange,
  onCustomize, onReportContentChange,
  pdfExcludedImages = [],
  onImageInPdfChange,
  readOnly = false,
  species = 'canine',
}) => {
  const { t } = useTranslation('media');
  const store = useAttachments(chartId, practiceId, maxImages, dicomEnabled);
  const touchDevice = useMediaQuery('(any-pointer: coarse)') || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  const [capturing, setCapturing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [queue, setQueue] = React.useState<QueueItem[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [viewing, setViewing] = React.useState<number | null>(null);
  const uploadHelpId = React.useId();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const chartIdRef = React.useRef(chartId);
  chartIdRef.current = chartId;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const uploadingRef = React.useRef(false);
  const teeth = React.useMemo(() => imageTeeth(species), [species]);
  const toothLabel = React.useCallback((triadan: number) => imageToothLabel(triadan), []);
  const canUpload = cloudActive && store.maxImages > 0 && !readOnly;

  // A chart switch closes the viewer and forgets the last chart's queue.
  React.useEffect(() => {
    setViewing(null);
    setQueue([]);
  }, [chartId]);

  const storeRef = React.useRef(store);
  storeRef.current = store;

  /** Upload a batch one file at a time; each file shows its own status.
   *  Files past the chart's limit fail up front with the limit message. */
  const addFiles = React.useCallback(async (files: File[]) => {
    if (files.length === 0 || uploadingRef.current) return;
    uploadingRef.current = true;
    const s = storeRef.current;
    const room = Math.max(0, s.maxImages - s.items.length);
    const batch: QueueItem[] = files.map((f, i) => ({
      key: `${Date.now()}-${i}-${f.name}`,
      name: f.name || t('imaging.pastedName'),
      status: i < room ? 'waiting' : 'failed',
      error: i < room ? undefined : t('imaging.limitReached', { max: s.maxImages }),
    }));
    setQueue((q) => [...q.filter((x) => x.status === 'failed'), ...batch]);
    setBusy(true);
    setError('');

    for (let i = 0; i < Math.min(room, files.length); i++) {
      const key = batch[i].key;
      setQueue((q) => q.map((x) => (x.key === key ? { ...x, status: 'uploading' } : x)));
      try {
        // Regular images start as photos; the upload hook detects DICOM
        // radiographs. Classification stays editable on each image card.
        await s.upload(files[i], 'photo', '');
        setQueue((q) => q.filter((x) => x.key !== key));
      } catch (err) {
        const message = errorText(err, t('imaging.addFailed'));
        setQueue((q) => q.map((x) => (x.key === key ? { ...x, status: 'failed', error: message } : x)));
      }
    }
    setBusy(false);
    uploadingRef.current = false;
  }, [t]);

  // Paste an image (screenshot, copied radiograph) while this section is
  // on screen. Sections stay mounted when hidden, hence the visibility check.
  React.useEffect(() => {
    if (!canUpload) return;
    const onPaste = (e: ClipboardEvent) => {
      const root = rootRef.current;
      if (!root || root.offsetParent === null) return;
      const files = filesFrom(e.clipboardData?.files);
      if (files.length === 0) return;
      e.preventDefault();
      void addFiles(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [canUpload, addFiles]);

  if (!cloudActive) {
    return (
      <div className="patient-form">
        <div className="patient-form__header">
          <h2 className="patient-form__section-title">{t('imaging.title')}</h2>
        </div>
        <p className="practice-logo-empty">
          {t('imaging.signedOut')}
        </p>
      </div>
    );
  }

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    await addFiles(files);
  };

  const onTakePhoto = async () => {
    if (!isNativeApp()) {
      cameraRef.current?.click();
      return;
    }
    const sourceChartId = chartId;
    setCapturing(true);
    setError('');
    try {
      const file = await takePhoto();
      if (file && chartIdRef.current === sourceChartId) await addFiles([file]);
    } catch (err) {
      if (chartIdRef.current === sourceChartId) setError(friendlyError(err, t('imaging.cameraFailed', { ns: 'chart' })));
    } finally {
      setCapturing(false);
    }
  };

  const atLimit = store.items.length >= store.maxImages;

  const dropProps = canUpload
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (!Array.from(e.dataTransfer.types).includes('Files')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = atLimit ? 'none' : 'copy';
          setDragging(true);
        },
        onDragLeave: (e: React.DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          setDragging(false);
          if (!atLimit) void addFiles(filesFrom(e.dataTransfer.files));
        },
      }
    : {};
  // The web keeps its wording; the app states the limit as a plain fact.
  // The iOS app: yes/no options are switches.
  const switchProps = isNativeApp() ? { role: 'switch', className: 'ios-switch' } : {};
  const limitMessage = isNativeApp()
    ? t('imaging.limitReached', { ns: 'chart', count: store.maxImages })
    : t('imaging.limitReached', { max: store.maxImages });

  const onDelete = async (id: string, caption: string) => {
    if (!(await confirmDialog({
      title: caption.trim() ? t('imaging.deleteTitleNamed', { caption: caption.trim() }) : t('imaging.deleteTitle'),
      message: t('imaging.deleteMessage'),
      confirmLabel: t('imaging.deleteConfirm'),
      danger: true,
    }))) return;
    if (chartIdRef.current !== chartId) return;
    onReportContentChange?.();
    setBusy(true);
    setError('');
    try {
      await store.remove(id);
    } catch (err) {
      setError(errorText(err, t('imaging.removeFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={rootRef} className={dragging ? 'patient-form imaging imaging--dragging' : 'patient-form imaging'} {...dropProps}>
      <SectionHeader title={t('imaging.title')} onCustomize={onCustomize} customizeTitle={t('imaging.customizeTitle')}>
        {store.loaded && store.maxImages > 0 && <span className="patient-form__hint">{t('imaging.usage', { used: store.items.length, max: store.maxImages })}</span>}
      </SectionHeader>

      {onIncludeInPdfChange && (store.maxImages > 0 || store.items.length > 0) && (
        <label
          className="dental-grid__option imaging__pdf-option"
          title={t('imaging.pdfOptionTitle')}
        >
          <input
            type="checkbox"
            {...switchProps}
            disabled={readOnly}
            checked={includeInPdf}
            onChange={(e) => onIncludeInPdfChange(e.target.checked)}
          />
          {t('imaging.pdfOption')}
          {includeInPdf && store.items.length > 0 && (
            <span className="patient-form__hint">
              {t('imaging.pdfSelected', { selected: store.items.filter((a) => !pdfExcludedImages.includes(a.id)).length, total: store.items.length })}
            </span>
          )}
        </label>
      )}

      {/* Zero-image plans (the free tier) get a plain explanation instead
          of a dead uploader. Existing images (e.g. from a lapsed paid
          plan) still render below. The app states the fact without plan
          wording (it sells nothing). */}
      {store.maxImages === 0 && (
        <p className="patient-form__hint">
          {isNativeApp()
            ? t('imaging.uploadsUnavailable', { ns: 'chart' })
            : t('imaging.freePlan')}
        </p>
      )}

      {store.maxImages > 0 && !readOnly && (
        <div className={`imaging-upload${dragging ? ' imaging-upload--dragging' : ''}${atLimit ? ' imaging-upload--full' : ''}`} aria-busy={busy || capturing}>
          <button
            type="button"
            className="imaging-upload__dropzone"
            onClick={() => fileRef.current?.click()}
            disabled={busy || capturing || atLimit || !store.loaded}
            title={atLimit ? limitMessage : undefined}
            aria-label={t('imaging.upload.title')}
            aria-describedby={uploadHelpId}
          >
            <span className="imaging-upload__plus" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 5v14M5 12h14" /></svg>
            </span>
            <span className="imaging-upload__title">{busy ? t('imaging.uploading') : dragging ? t('imaging.dropHint') : t('imaging.upload.title')}</span>
            <span className="imaging-upload__hint" id={uploadHelpId}>{atLimit ? limitMessage : isNativeApp() || touchDevice ? t('imaging.upload.touchHint') : t('imaging.upload.dropHint')}</span>
          </button>
          <div className="imaging-upload__actions">
            <button type="button" className="diagram-view__action" disabled={busy || capturing || atLimit || !store.loaded} onClick={() => fileRef.current?.click()}>
              {isNativeApp() || touchDevice ? t('imaging.upload.library') : t('imaging.upload.files')}
            </button>
            {(isNativeApp() || touchDevice) && (
              <button type="button" className="diagram-view__action" onClick={onTakePhoto} disabled={busy || capturing || atLimit || !store.loaded} title={atLimit ? limitMessage : undefined}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h4l2-3h4l2 3h4v15H4Z" /><circle cx="12" cy="13" r="4" /></svg>
                {t('imaging.takePhoto', { ns: 'chart' })}
              </button>
            )}
          </div>
          <p className="imaging-upload__formats">
            {store.dicomEnabled ? t('imaging.formatsDicom') : isNativeApp() ? t('imaging.formatsApp', { ns: 'chart' }) : t('imaging.formatsPlain')}
          </p>
          <input ref={fileRef} type="file" multiple
            accept={store.dicomEnabled ? 'image/png,image/jpeg,image/webp,.dcm,.dicom,application/dicom' : 'image/png,image/jpeg,image/webp'}
            onChange={onPick} hidden />
          {!isNativeApp() && touchDevice && <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onPick} hidden />}
        </div>
      )}

      {queue.length > 0 && (
        <ul className="imaging__queue" aria-live="polite">
          {queue.map((q) => (
            <li key={q.key} className={`imaging__queue-item imaging__queue-item--${q.status}`}>
              <span className="imaging__queue-name">{q.name}</span>
              <span className="imaging__queue-status">
                {q.status === 'failed' ? q.error : q.status === 'uploading' ? t('imaging.uploading') : t('imaging.waiting')}
              </span>
              {q.status === 'failed' && (
                <button
                  type="button"
                  className="imaging__queue-dismiss"
                  onClick={() => setQueue((list) => list.filter((x) => x.key !== q.key))}
                  aria-label={t('actions.dismiss', { ns: 'common' })}
                  title={t('actions.dismiss', { ns: 'common' })}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <div className="login-error" role="alert">{error}</div>}

      {!store.loaded ? (
        <p className="practice-logo-empty">{t('imaging.loading')}</p>
      ) : store.items.length === 0 ? (
        store.maxImages > 0 && readOnly ? (
          <p className="practice-logo-empty">
            {t('imaging.empty')}
          </p>
        ) : null
      ) : (
        <ul className="imaging__grid">
          {store.items.map((a, i) => (
            <li key={a.id} className="imaging__card">
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="imaging__thumb-link"
                title={t('imaging.openViewer')}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  setViewing(i);
                }}
              >
                {a.toothTriadan !== null && <span className="imaging__tooth-badge">{a.toothTriadan}</span>}
                {a.url ? (
                  <img src={a.thumbUrl || a.url} alt={a.caption || (a.kind === 'xray' ? t('imaging.altXray') : t('imaging.altPhoto'))} className="imaging__thumb" loading="lazy" />
                ) : (
                  <span className="imaging__thumb imaging__thumb--missing">{t('imaging.missing')}</span>
                )}
              </a>
              <div className="imaging__meta">
                <select
                  disabled={readOnly}
                  className="imaging__kind-select"
                  value={a.kind}
                  onChange={(e) => {
                    onReportContentChange?.();
                    store.updateKind(a.id, e.target.value as AttachmentKind).catch((err) =>
                      setError(errorText(err, t('imaging.kindFailed')))
                    );
                  }}
                  aria-label={t('imaging.typeAria')}
                  title={t('imaging.kindTitle')}
                >
                  {KINDS.map((k) => <option key={k} value={k}>{t(`imaging.${k === 'photo' ? 'photo' : 'radiograph'}`)}</option>)}
                </select>
                <select
                  disabled={readOnly}
                  className="imaging__tooth-select"
                  value={a.toothTriadan ?? ''}
                  onChange={(e) => {
                    const v = e.target.value ? Number(e.target.value) : null;
                    onReportContentChange?.();
                    store.updateTooth(a.id, v).catch((err) => setError(errorText(err, t('imaging.toothFailed'))));
                  }}
                  aria-label={t('imaging.toothAria')}
                  title={t('imaging.toothTitle')}
                >
                  <option value="">{t('imaging.toothNone')}</option>
                  {a.toothTriadan !== null && !teeth.includes(a.toothTriadan) && (
                    <option value={a.toothTriadan}>{toothLabel(a.toothTriadan)}</option>
                  )}
                  {teeth.map((n) => <option key={n} value={n}>{toothLabel(n)}</option>)}
                </select>
                {a.originalPath && (
                  a.originalUrl ? (
                    <a
                      href={a.originalUrl}
                      className="imaging__dicom"
                      title={t('imaging.dicomDownloadTitle')}
                    >
                      {t('imaging.dicomDownload')}
                    </a>
                  ) : (
                    <span className="imaging__dicom" title={t('imaging.dicomStoredTitle')}>
                      {t('imaging.dicom')}
                    </span>
                  )
                )}
                {onImageInPdfChange && includeInPdf && (
                  <label className="imaging__in-pdf" title={t('imaging.inPdfTitle')}>
                    <input
                      type="checkbox"
                      {...switchProps}
            disabled={readOnly}
                      checked={!pdfExcludedImages.includes(a.id)}
                      onChange={(e) => onImageInPdfChange(a.id, e.target.checked)}
                    />
                    {t('imaging.inPdf')}
                  </label>
                )}
                {onImageRoleChange && (
                  <select
                  disabled={readOnly}
                    className="imaging__role"
                    value={imageRoles[a.id] ?? ''}
                    onChange={(e) =>
                      onImageRoleChange(a.id, (e.target.value || null) as ImageRole | null)
                    }
                    aria-label={t('imaging.roleAria')}
                    title={t('imaging.roleTitle')}
                  >
                    <option value="">{t('imaging.roleNone')}</option>
                    {ROLES.map((r) => <option key={r} value={r}>{t(`imaging.${r}`)}</option>)}
                  </select>
                )}
                <input
                  type="text"
                  className="patient-form__input imaging__caption"
                  placeholder={t('imaging.captionPlaceholder')}
                  defaultValue={a.caption}
                  readOnly={readOnly}
                  aria-label={t('imaging.captionAria')}
                  onBlur={(e) => {
                    const input = e.target;
                    if (input.value !== a.caption) {
                      onReportContentChange?.();
                      store.updateCaption(a.id, input.value).catch(() => {
                        // Put the saved caption back so the field never
                        // shows text that isn't actually stored.
                        input.value = a.caption;
                        setError(t('imaging.captionFailed'));
                      });
                    }
                  }}
                />
                {!readOnly && <button
                  type="button"
                  className="diagram-view__action diagram-view__action--danger imaging__delete"
                  onClick={() => onDelete(a.id, a.caption)}
                  disabled={busy}
                >
                  {t('imaging.remove')}
                </button>}
              </div>
            </li>
          ))}
        </ul>
      )}


      {viewing !== null && store.items[viewing] && (
        <ImageViewer
          items={store.items}
          index={viewing}
          onIndexChange={setViewing}
          onClose={() => setViewing(null)}
          toothLabel={toothLabel}
        />
      )}
    </div>
  );
};
