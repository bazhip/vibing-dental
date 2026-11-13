import React from 'react';
import { useTranslation } from 'react-i18next';
import { confirmDialog } from './ui/dialogs';
import { errorText } from '../utils/apiErrors';
import { useAttachments, AttachmentKind } from '../hooks/useAttachments';
import { ImageRole } from '../types';

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
  onCustomize,
  pdfExcludedImages = [],
  onImageInPdfChange,
  readOnly = false,
}) => {
  const { t } = useTranslation('media');
  const store = useAttachments(chartId, practiceId, maxImages, dicomEnabled);
  const [kind, setKind] = React.useState<AttachmentKind>('photo');
  const [description, setDescription] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);

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
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await store.upload(file, kind, description);
      setDescription('');
    } catch (err) {
      setError(errorText(err, t('imaging.addFailed')));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string, caption: string) => {
    if (!(await confirmDialog({
      title: caption.trim() ? t('imaging.deleteTitleNamed', { caption: caption.trim() }) : t('imaging.deleteTitle'),
      message: t('imaging.deleteMessage'),
      confirmLabel: t('imaging.deleteConfirm'),
      danger: true,
    }))) return;
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
    <div className="patient-form">
      <div className="patient-form__header">
        <h2 className="patient-form__section-title">{t('imaging.title')}</h2>
        {store.loaded && store.maxImages > 0 && (
          <span className="patient-form__hint">
            {t('imaging.usage', { used: store.items.length, max: store.maxImages })}
          </span>
        )}
        {onCustomize && (
          <button type="button" className="diagram-view__action" onClick={onCustomize} title={t('imaging.customizeTitle')}>
            {t('imaging.customize')}
          </button>
        )}
      </div>

      {onIncludeInPdfChange && (store.maxImages > 0 || store.items.length > 0) && (
        <label
          className="dental-grid__option imaging__pdf-option"
          title={t('imaging.pdfOptionTitle')}
        >
          <input
            type="checkbox"
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
          plan) still render below. */}
      {store.maxImages === 0 && (
        <p className="patient-form__hint">
          {t('imaging.freePlan')}
        </p>
      )}

      {store.maxImages > 0 && !readOnly && (
      <div className="imaging__uploader">
        <div className="imaging__kind" role="radiogroup" aria-label={t('imaging.typeAria')}>
          <label className={kind === 'photo' ? 'imaging__kind-opt imaging__kind-opt--on' : 'imaging__kind-opt'}>
            <input type="radio" name="img-kind" checked={kind === 'photo'} onChange={() => setKind('photo')} />
            {t('imaging.photo')}
          </label>
          <label className={kind === 'xray' ? 'imaging__kind-opt imaging__kind-opt--on' : 'imaging__kind-opt'}>
            <input type="radio" name="img-kind" checked={kind === 'xray'} onChange={() => setKind('xray')} />
            {t('imaging.radiograph')}
          </label>
        </div>
        <input
          type="text"
          className="patient-form__input imaging__desc"
          placeholder={t('imaging.descriptionPlaceholder')}
          aria-label={t('imaging.descriptionAria')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button
          type="button"
          className="diagram-view__action"
          onClick={() => fileRef.current?.click()}
          disabled={busy || store.items.length >= store.maxImages}
          title={store.items.length >= store.maxImages ? t('imaging.limitReached', { max: store.maxImages }) : undefined}
        >
          {busy ? t('imaging.uploading') : t('imaging.add')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={
            store.dicomEnabled
              ? 'image/png,image/jpeg,image/webp,.dcm,.dicom,application/dicom'
              : 'image/png,image/jpeg,image/webp'
          }
          onChange={onPick}
          style={{ display: 'none' }}
        />
      </div>
      )}

      {store.maxImages > 0 && !readOnly && (
        <p className="patient-form__hint imaging__formats">
          {store.dicomEnabled
            ? t('imaging.formatsDicom')
            : t('imaging.formatsPlain')}
        </p>
      )}

      {error && <div className="login-error" role="alert">{error}</div>}

      {!store.loaded ? (
        <p className="practice-logo-empty">{t('imaging.loading')}</p>
      ) : store.items.length === 0 ? (
        store.maxImages > 0 ? (
          <p className="practice-logo-empty">
            {t('imaging.empty')}
          </p>
        ) : null
      ) : (
        <ul className="imaging__grid">
          {store.items.map((a) => (
            <li key={a.id} className="imaging__card">
              <a href={a.url} target="_blank" rel="noreferrer" className="imaging__thumb-link">
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
                    store.updateKind(a.id, e.target.value as AttachmentKind).catch((err) =>
                      setError(errorText(err, t('imaging.kindFailed')))
                    );
                  }}
                  aria-label={t('imaging.typeAria')}
                  title={t('imaging.kindTitle')}
                >
                  {KINDS.map((k) => <option key={k} value={k}>{t(`imaging.${k === 'photo' ? 'photo' : 'radiograph'}`)}</option>)}
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
    </div>
  );
};
