import React from 'react';
import {
  PDF_STYLES,
  DEFAULT_PDF_STYLE_ID,
  customStyleColor,
  customStyleId,
  resolvePdfStyle,
  styleSwatch,
} from '../utils/pdf/styles';
import { readString, writeString } from '../utils/storage';

const STYLE_KEY = 'pdfStyle';
const COLOR_KEY = 'pdfCustomColor';
const DEFAULT_CUSTOM = '#7c3aed';

/** The last PDF style used on this device (preset or custom color). */
export function readSavedPdfStyle(): string {
  return readString(STYLE_KEY, 1, DEFAULT_PDF_STYLE_ID);
}
export function savePdfStyle(styleId: string): void {
  writeString(STYLE_KEY, 1, styleId);
  const color = customStyleColor(styleId);
  if (color) writeString(COLOR_KEY, 1, color);
}

/** True on phone-width screens, where the style list collapses to a button. */
export function useCompactPdfLayout(): boolean {
  const query = '(max-width: 800px)';
  const get = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches;
  const [compact, setCompact] = React.useState(get);
  React.useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setCompact(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return compact;
}

interface Props {
  styleId: string;
  onChange: (styleId: string) => void;
  compact: boolean;
}

/**
 * PDF style chooser: the five presets plus "Custom color" (the chosen
 * preset's layout in any accent, picked with the platform color picker).
 * Wide screens get the list inline; phones get a compact button that opens
 * a bottom sheet, so the preview keeps the screen.
 */
export const PdfStylePicker: React.FC<Props> = ({ styleId, onChange, compact }) => {
  const [open, setOpen] = React.useState(false);
  const active = resolvePdfStyle(styleId);
  const customColor = customStyleColor(styleId);
  const [lastColor, setLastColor] = React.useState(() => customColor ?? readString(COLOR_KEY, 1, DEFAULT_CUSTOM));
  // Custom colors reuse the layout of the preset they were picked on.
  const baseId = customColor ? active.id.split(':')[1] : active.id;

  const pick = (id: string) => onChange(id);
  const pickColor = (hex: string) => {
    setLastColor(hex);
    onChange(customStyleId(hex, baseId));
  };

  const list = (
    <ul role="radiogroup" aria-label="PDF style" className="pdf-style-list">
      {PDF_STYLES.map((s) => {
        const on = s.id === styleId;
        return (
          <li key={s.id}>
            <button
              type="button"
              role="radio"
              aria-checked={on}
              className={`pdf-preview-style${on ? ' pdf-preview-style--active' : ''}`}
              onClick={() => pick(s.id)}
            >
              <span className="pdf-style-row">
                <span className="pdf-style-swatch" style={{ background: styleSwatch(s) }} aria-hidden="true" />
                <strong>{s.name}</strong>
              </span>
              <span>{s.description}</span>
            </button>
          </li>
        );
      })}
      <li>
        <div className={`pdf-preview-style pdf-style-custom${customColor ? ' pdf-preview-style--active' : ''}`}>
          <button
            type="button"
            role="radio"
            aria-checked={!!customColor}
            className="pdf-style-custom__pick"
            onClick={() => pickColor(lastColor)}
          >
            <span className="pdf-style-row">
              <span className="pdf-style-swatch pdf-style-swatch--custom" style={{ background: customColor ?? lastColor }} aria-hidden="true" />
              <strong>Custom color</strong>
            </span>
            <span>Any color you like, on the {PDF_STYLES.find((s) => s.id === baseId)?.name ?? 'current'} layout.</span>
          </button>
          <label className="pdf-style-custom__color">
            <span className="visually-hidden">Choose custom color</span>
            <input
              type="color"
              value={customColor ?? lastColor}
              onChange={(e) => pickColor(e.target.value)}
              aria-label="Choose custom color"
            />
          </label>
        </div>
      </li>
    </ul>
  );

  if (!compact) return list;

  return (
    <>
      <button
        type="button"
        className="pdf-style-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="pdf-style-swatch" style={{ background: styleSwatch(active) }} aria-hidden="true" />
        <span className="pdf-style-button__label">{customColor ? 'Custom' : active.name}</span>
        <span aria-hidden="true" className="pdf-style-button__chevron">▾</span>
      </button>
      {open && (
        <div className="pdf-style-sheet-backdrop" onClick={() => setOpen(false)}>
          <div
            className="pdf-style-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="PDF style"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pdf-style-sheet__header">
              <h3>PDF style</h3>
              <button type="button" className="pdf-style-sheet__done" onClick={() => setOpen(false)}>Done</button>
            </div>
            {list}
          </div>
        </div>
      )}
    </>
  );
};
