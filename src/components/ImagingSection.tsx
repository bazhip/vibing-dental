import React from 'react';
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
  /** Owner-report before/after tags (attachment id → role). */
  imageRoles?: Record<string, ImageRole>;
  /** Tag (or untag, with null) an image for the owner report. */
  onImageRoleChange?: (attachmentId: string, role: ImageRole | null) => void;
}

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
  imageRoles = {},
  onImageRoleChange,
}) => {
  const store = useAttachments(chartId, practiceId, maxImages);
  const [kind, setKind] = React.useState<AttachmentKind>('photo');
  const [description, setDescription] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);

  if (!cloudActive) {
    return (
      <div className="patient-form">
        <div className="patient-form__header">
          <h2 className="patient-form__section-title">Images &amp; Radiographs</h2>
        </div>
        <p className="practice-logo-empty">
          Sign in with a practice account to attach intraoral photos and
          dental radiographs — they're stored privately alongside the chart.
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
      setError(err instanceof Error ? err.message : 'Could not add that image.');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string, caption: string) => {
    if (!window.confirm(`Remove ${caption.trim() || 'this image'}? This deletes it permanently.`)) return;
    setBusy(true);
    setError('');
    try {
      await store.remove(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="patient-form">
      <div className="patient-form__header">
        <h2 className="patient-form__section-title">Images &amp; Radiographs</h2>
        {store.loaded && store.maxImages > 0 && (
          <span className="patient-form__hint">
            {store.items.length} of {store.maxImages} images
          </span>
        )}
      </div>

      {/* Zero-image plans (the free tier) get a plain explanation instead
          of a dead uploader. Existing images (e.g. from a lapsed paid
          plan) still render below. */}
      {store.maxImages === 0 && (
        <p className="patient-form__hint">
          Photo &amp; radiograph uploads aren't included in the free plan.
        </p>
      )}

      {store.maxImages > 0 && (
      <div className="imaging__uploader">
        <div className="imaging__kind" role="radiogroup" aria-label="Image type">
          <label className={kind === 'photo' ? 'imaging__kind-opt imaging__kind-opt--on' : 'imaging__kind-opt'}>
            <input type="radio" name="img-kind" checked={kind === 'photo'} onChange={() => setKind('photo')} />
            Photo
          </label>
          <label className={kind === 'xray' ? 'imaging__kind-opt imaging__kind-opt--on' : 'imaging__kind-opt'}>
            <input type="radio" name="img-kind" checked={kind === 'xray'} onChange={() => setKind('xray')} />
            Radiograph
          </label>
        </div>
        <input
          type="text"
          className="patient-form__input imaging__desc"
          placeholder="Description (optional)"
          aria-label="Image description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button
          type="button"
          className="diagram-view__action"
          onClick={() => fileRef.current?.click()}
          disabled={busy || store.items.length >= store.maxImages}
          title={store.items.length >= store.maxImages ? `Limit of ${store.maxImages} images reached` : undefined}
        >
          {busy ? 'Uploading…' : 'Add image'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onPick}
          style={{ display: 'none' }}
        />
      </div>
      )}

      {error && <div className="login-error" role="alert">{error}</div>}

      {!store.loaded ? (
        <p className="practice-logo-empty">Loading images…</p>
      ) : store.items.length === 0 ? (
        store.maxImages > 0 ? (
          <p className="practice-logo-empty">
            No images yet. Add intraoral photos or dental radiographs above.
          </p>
        ) : null
      ) : (
        <ul className="imaging__grid">
          {store.items.map((a) => (
            <li key={a.id} className="imaging__card">
              <a href={a.url} target="_blank" rel="noreferrer" className="imaging__thumb-link">
                {a.url ? (
                  <img src={a.url} alt={a.caption || `${a.kind} image`} className="imaging__thumb" loading="lazy" />
                ) : (
                  <span className="imaging__thumb imaging__thumb--missing">image</span>
                )}
              </a>
              <div className="imaging__meta">
                <span className="imaging__badge">
                  {a.kind === 'xray' ? 'Radiograph' : 'Photo'}
                </span>
                {onImageRoleChange && (
                  <select
                    className="imaging__role"
                    value={imageRoles[a.id] ?? ''}
                    onChange={(e) =>
                      onImageRoleChange(a.id, (e.target.value || null) as ImageRole | null)
                    }
                    aria-label="Owner-report tag for this image"
                    title="Tag this image for the owner report's Before & After section"
                  >
                    <option value="">Not in report</option>
                    <option value="before">Before</option>
                    <option value="after">After</option>
                  </select>
                )}
                <input
                  type="text"
                  className="patient-form__input imaging__caption"
                  placeholder="Caption…"
                  defaultValue={a.caption}
                  onBlur={(e) => {
                    if (e.target.value !== a.caption) {
                      store.updateCaption(a.id, e.target.value).catch(() => {});
                    }
                  }}
                />
                <button
                  type="button"
                  className="diagram-view__action diagram-view__action--danger imaging__delete"
                  onClick={() => onDelete(a.id, a.caption)}
                  disabled={busy}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
