import React from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { useTranslation } from 'react-i18next';
import type { Attachment } from '../hooks/useAttachments';
import { errorText } from '../utils/apiErrors';

/**
 * Modal viewer for a chart's photos and radiographs: zoom (wheel,
 * buttons, keys), pan (drag), rotate, flip, invert and brightness /
 * contrast, with previous/next through the chart's images.
 *
 * DICOM radiographs can switch to window/level on the stored original:
 * the .dcm is fetched and decoded on demand (the decoder loads lazily),
 * so the full bit depth is windowed instead of the 8-bit preview.
 */

type Gray = {
  kind: 'gray';
  width: number;
  height: number;
  values: Float32Array;
  min: number;
  max: number;
  windowCenter?: number;
  windowWidth?: number;
  invert: boolean;
};

type DicomState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; pixels: Gray; center: number; width: number };

export interface ImageViewerProps {
  items: Attachment[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Tooth name for an image pinned to a tooth (e.g. "108 · Right maxillary 4th premolar"). */
  toothLabel?: (triadan: number) => string;
  /** The visit an image is from, when browsing several (Image history). */
  dateLabel?: (item: Attachment) => string | undefined;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 12;
const ZOOM_STEP = 1.25;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Default window for decoded grayscale pixels: the file's, else the full range. */
export function defaultWindow(p: { min: number; max: number; windowCenter?: number; windowWidth?: number }): { center: number; width: number } {
  if (p.windowCenter !== undefined && p.windowWidth !== undefined && p.windowWidth >= 1) {
    return { center: p.windowCenter, width: p.windowWidth };
  }
  return { center: (p.min + p.max + 1) / 2, width: Math.max(1, p.max - p.min + 1) };
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ items, index, onIndexChange, onClose, toothLabel, dateLabel }) => {
  const { t } = useTranslation('media');
  const item = items[index];
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [rotation, setRotation] = React.useState(0);
  const [flip, setFlip] = React.useState(false);
  const [invert, setInvert] = React.useState(false);
  const [brightness, setBrightness] = React.useState(100);
  const [contrast, setContrast] = React.useState(100);
  const [dicom, setDicom] = React.useState<DicomState>({ status: 'off' });
  const dialogRef = useModalFocus<HTMLDivElement>(!!item);
  const backdrop = useBackdropDismiss(onClose);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const moreId = React.useId();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  // The image on screen now: a slow DICOM load must not land on the next one.
  const currentId = React.useRef(item?.id);
  currentId.current = item?.id;
  const drag = React.useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const reset = React.useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setFlip(false);
    setInvert(false);
    setBrightness(100);
    setContrast(100);
  }, []);

  // A new image starts from a clean view (and the preview, not the original).
  React.useEffect(() => {
    reset();
    setDicom({ status: 'off' });
  }, [item?.id, reset]);

  const go = React.useCallback(
    (delta: number) => {
      if (items.length < 2) return;
      onIndexChange((index + delta + items.length) % items.length);
    },
    [index, items.length, onIndexChange]
  );

  const zoomBy = React.useCallback((factor: number) => {
    setZoom((z) => {
      const next = clamp(z * factor, MIN_ZOOM, MAX_ZOOM);
      // Keep the point under the centre where it is.
      setPan((p) => ({ x: (p.x * next) / z, y: (p.y * next) / z }));
      return next;
    });
  }, []);

  const loadDicom = React.useCallback(async () => {
    if (!item?.originalUrl) return;
    const forId = item.id;
    // The load button is disabled now and replaced by sliders on success.
    // Keep focus in the modal so Escape still works throughout the request.
    dialogRef.current?.focus();
    setDicom({ status: 'loading' });
    try {
      const res = await fetch(item.originalUrl);
      // eslint-disable-next-line no-restricted-syntax -- dev-only: replaced by the translated message below
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const { decodeDicomPixels } = await import('../utils/dicom');
      const pixels = await decodeDicomPixels(bytes);
      if (currentId.current !== forId) return;
      if (pixels.kind !== 'gray') {
        // Colour DICOM: brightness/contrast on the preview is all there is.
        setDicom({ status: 'failed', message: t('viewer.dicomColor') });
        return;
      }
      if (currentId.current !== forId) return;
      setDicom((cur) => (cur.status === 'loading' ? { status: 'ready', pixels, ...defaultWindow(pixels) } : cur));
    } catch (err) {
      if (currentId.current !== forId) return;
      setDicom({ status: 'failed', message: errorText(err, t('viewer.dicomFailed')) });
    }
  }, [item, t]);

  // Draw the windowed original whenever the window changes (one frame at a time).
  React.useEffect(() => {
    if (dicom.status !== 'ready') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const frame = requestAnimationFrame(async () => {
      const { windowToRgba } = await import('../utils/dicom');
      if (cancelled) return;
      const { pixels, center, width } = dicom;
      canvas.width = pixels.width;
      canvas.height = pixels.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const rgba = windowToRgba(pixels.values, pixels.width, pixels.height, center, width, pixels.invert);
      ctx.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, pixels.width, pixels.height), 0, 0);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [dicom]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // A viewer opened over another dialog owns its keyboard shortcuts.
    e.stopPropagation();
    if ((e.target as HTMLElement).tagName === 'INPUT') {
      if (e.key === 'Escape') onClose();
      return;
    }
    switch (e.key) {
      case 'Escape': onClose(); break;
      case 'ArrowLeft': go(-1); break;
      case 'ArrowRight': go(1); break;
      case '+': case '=': zoomBy(ZOOM_STEP); break;
      case '-': zoomBy(1 / ZOOM_STEP); break;
      case '0': reset(); break;
      case 'r': case 'R': setRotation((r) => (r + (e.shiftKey ? 270 : 90)) % 360); break;
      case 'i': case 'I': setInvert((v) => !v); break;
      default: return;
    }
    e.preventDefault();
  };

  const onWheel = (e: React.WheelEvent) => {
    zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (e.shiftKey && dicom.status === 'ready') {
      // Shift-drag: horizontal = window width, vertical = level (center).
      const range = Math.max(1, dicom.pixels.max - dicom.pixels.min);
      const step = range / 500;
      setDicom((cur) =>
        cur.status === 'ready'
          ? { ...cur, width: Math.max(1, cur.width + (e.movementX ?? 0) * step), center: cur.center + (e.movementY ?? 0) * step }
          : cur
      );
      return;
    }
    setPan({ x: d.panX + dx, y: d.panY + dy });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  if (!item) return null;

  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg) scaleX(${flip ? -1 : 1})`;
  const windowed = dicom.status === 'ready';
  const filter = [
    windowed ? '' : `brightness(${brightness}%) contrast(${contrast}%)`,
    invert ? 'invert(1)' : '',
  ].filter(Boolean).join(' ') || undefined;
  const kindLabel = item.kind === 'xray' ? t('imaging.radiograph') : t('imaging.photo');
  const range = windowed ? Math.max(1, dicom.pixels.max - dicom.pixels.min) : 1;

  return createPortal(
    <div className="image-viewer-overlay" {...backdrop}>
      <div
        ref={dialogRef}
        className="image-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={t('viewer.title')}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="image-viewer__bar">
          <div className="image-viewer__info">
            <span className="image-viewer__count">{t('viewer.count', { n: index + 1, total: items.length })}</span>
            <span className="image-viewer__kind">{kindLabel}</span>
            {dateLabel?.(item) && <span className="image-viewer__date">{dateLabel(item)}</span>}
            {item.toothTriadan !== null && (
              <span className="image-viewer__tooth">{toothLabel ? toothLabel(item.toothTriadan) : item.toothTriadan}</span>
            )}
            {item.caption && <span className="image-viewer__caption">{item.caption}</span>}
          </div>
          <button type="button" className="image-viewer__close" onClick={onClose} aria-label={t('viewer.close')} title={t('viewer.close')}>✕</button>
        </div>
        <div className="image-viewer__controls">
          <div className="image-viewer__tools" role="toolbar" aria-label={t('viewer.tools')}>
            <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)} title={t('viewer.zoomOut')} aria-label={t('viewer.zoomOut')}>−</button>
            <span className="image-viewer__zoom">{t('viewer.zoomLevel', { pct: Math.round(zoom * 100) })}</span>
            <button type="button" onClick={() => zoomBy(ZOOM_STEP)} title={t('viewer.zoomIn')} aria-label={t('viewer.zoomIn')}>+</button>
            <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{t('viewer.fit')}</button>
            <button type="button" aria-expanded={moreOpen} aria-controls={moreId} onClick={() => setMoreOpen((v) => !v)}>{t('ios.moreActions', { ns: 'common' })}</button>
          </div>
          <div id={moreId} className="image-viewer__secondary" hidden={!moreOpen}>
            <button type="button" onClick={() => setRotation((r) => (r + 270) % 360)} title={t('viewer.rotateLeft')} aria-label={t('viewer.rotateLeft')}>⟲</button>
            <button type="button" onClick={() => setRotation((r) => (r + 90) % 360)} title={t('viewer.rotateRight')} aria-label={t('viewer.rotateRight')}>⟳</button>
            <button type="button" aria-pressed={flip} onClick={() => setFlip((v) => !v)}>{t('viewer.flip')}</button>
            <button type="button" aria-pressed={invert} onClick={() => setInvert((v) => !v)}>{t('viewer.invert')}</button>
            <button type="button" onClick={reset}>{t('viewer.reset')}</button>
            <a className="image-viewer__download" href={item.originalUrl || item.url} target="_blank" rel="noreferrer" download>
              {item.originalUrl ? t('viewer.downloadDicom') : t('viewer.download')}
            </a>
          </div>

          <div className="image-viewer__adjust">
            {windowed ? (
              <>
                <label>
                  {t('viewer.level')}
                  <input
                    type="range"
                    min={dicom.pixels.min}
                    max={dicom.pixels.max}
                    step={range / 1000}
                    value={dicom.center}
                    onChange={(e) => {
                      const center = Number(e.target.value);
                      setDicom((cur) => (cur.status === 'ready' ? { ...cur, center } : cur));
                    }}
                  />
                </label>
                <label>
                  {t('viewer.window')}
                  <input
                    type="range"
                    min={1}
                    max={range * 2}
                    step={range / 1000}
                    value={dicom.width}
                    onChange={(e) => {
                      const width = Number(e.target.value);
                      setDicom((cur) => (cur.status === 'ready' ? { ...cur, width } : cur));
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setDicom((cur) => (cur.status === 'ready' ? { ...cur, ...defaultWindow(cur.pixels) } : cur))}
                >
                  {t('viewer.resetWindow')}
                </button>
                <span className="image-viewer__hint">{t('viewer.windowHint')}</span>
              </>
            ) : (
              <>
                <label>
                  {t('viewer.brightness')}
                  <input type="range" min={20} max={300} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} />
                </label>
                <label>
                  {t('viewer.contrast')}
                  <input type="range" min={20} max={300} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} />
                </label>
                {item.originalUrl && (
                  <button type="button" onClick={loadDicom} disabled={dicom.status === 'loading'} title={t('viewer.windowLevelTitle')}>
                    {dicom.status === 'loading' ? t('viewer.dicomLoading') : t('viewer.windowLevel')}
                  </button>
                )}
                {dicom.status === 'failed' && <span className="image-viewer__error" role="alert">{dicom.message}</span>}
              </>
            )}
          </div>

        </div>

        <div
          className="image-viewer__stage"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => (zoom === 1 ? zoomBy(2) : (setZoom(1), setPan({ x: 0, y: 0 })))}
        >
          {items.length > 1 && (
            <button
              type="button"
              className="image-viewer__nav image-viewer__nav--prev"
              onClick={() => go(-1)}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={t('viewer.previous')}
              title={t('viewer.previous')}
            >
              ‹
            </button>
          )}
          <div className="image-viewer__frame" style={{ transform, filter }}>
            {windowed ? (
              <canvas ref={canvasRef} className="image-viewer__media" aria-label={item.caption || kindLabel} role="img" />
            ) : item.url ? (
              <img src={item.url} alt={item.caption || kindLabel} className="image-viewer__media" draggable={false} />
            ) : (
              <span className="image-viewer__missing">{t('viewer.missing')}</span>
            )}
          </div>
          {items.length > 1 && (
            <button
              type="button"
              className="image-viewer__nav image-viewer__nav--next"
              onClick={() => go(1)}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={t('viewer.next')}
              title={t('viewer.next')}
            >
              ›
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
