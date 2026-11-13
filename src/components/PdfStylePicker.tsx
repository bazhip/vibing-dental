import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  PDF_STYLES,
  DEFAULT_PDF_STYLE_ID,
  customStyleColor,
  customStyleId,
  resolvePdfStyle,
  styleSwatch,
} from '../utils/pdf/styles';
import { readString, writeString } from '../utils/storage';
import type chartCatalog from '../locales/en/chart.json';
import { isNativeApp } from '../native/platform';
import { MenuPopover, type MenuAnchor, type MenuItem } from '../ios/ContextMenu';
import { Icon, type IconName } from '../ios/icons';

const STYLE_KEY = 'pdfStyle';
const COLOR_KEY = 'pdfCustomColor';
const DEFAULT_CUSTOM = '#7c3aed';
const CHEVRON_ICON: IconName = 'chevron-down';

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

type PresetId = keyof (typeof chartCatalog)['pdfStyle']['styles'];

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
  const { t } = useTranslation('chart');
  // Preset names and blurbs come from the catalog, keyed by preset id
  // (styles.ts keeps the English originals as the fallback).
  const preset = (id: string) => PDF_STYLES.find((s) => s.id === id);
  const styleName = (id: string) =>
    t(`pdfStyle.styles.${id as PresetId}.name`, { defaultValue: preset(id)?.name ?? id });
  const styleDescription = (id: string) =>
    t(`pdfStyle.styles.${id as PresetId}.description`, { defaultValue: preset(id)?.description ?? '' });
  const [open, setOpen] = React.useState(false);
  const [menuAnchor, setMenuAnchor] = React.useState<MenuAnchor | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const colorRef = React.useRef<HTMLInputElement>(null);
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
    <ul role="radiogroup" aria-label={t('pdfStyle.label')} className="pdf-style-list">
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
                <strong>{styleName(s.id)}</strong>
              </span>
              <span>{styleDescription(s.id)}</span>
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
              <strong>{t('pdfStyle.customColor')}</strong>
            </span>
            <span>
              {preset(baseId)
                ? t('pdfStyle.customDescription', { base: styleName(baseId) })
                : t('pdfStyle.customDescriptionCurrent')}
            </span>
          </button>
          <label className="pdf-style-custom__color">
            <span className="visually-hidden">{t('pdfStyle.chooseColor')}</span>
            <input
              type="color"
              value={customColor ?? lastColor}
              onChange={(e) => pickColor(e.target.value)}
              aria-label={t('pdfStyle.chooseColor')}
            />
          </label>
        </div>
      </li>
    </ul>
  );

  if (!compact) return list;

  // iOS app: a pull-down menu on the button (a popover-style menu on iPad
  // too) — presets with their swatch and a checkmark, plus "Custom Color…"
  // which opens the system color picker. The preview behind updates live.
  // (A menu, not a second sheet: the picker lives inside the Documents sheet.)
  if (isNativeApp()) {
    const openMenu = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (r) setMenuAnchor({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    const items: MenuItem[] = [
      ...PDF_STYLES.map((s) => ({
        label: styleName(s.id),
        checked: s.id === styleId,
        accessory: <span className="pdf-style-swatch" style={{ background: styleSwatch(s) }} />,
        onSelect: () => pick(s.id),
      })),
      {
        label: t('ios.sheets.customColor', { ns: 'common' }),
        checked: !!customColor,
        accessory: <span className="pdf-style-swatch pdf-style-swatch--custom" style={{ background: customColor ?? lastColor }} />,
        onSelect: () => {
          pickColor(customColor ?? lastColor);
          colorRef.current?.click();
        },
      },
    ];
    return (
      <>
        <button
          ref={buttonRef}
          type="button"
          className="pdf-style-button"
          aria-haspopup="menu"
          aria-expanded={!!menuAnchor}
          onClick={openMenu}
        >
          <span className="pdf-style-swatch" style={{ background: styleSwatch(active) }} aria-hidden="true" />
          <span className="pdf-style-button__label">{customColor ? t('pdfStyle.custom') : styleName(active.id)}</span>
          <Icon name={CHEVRON_ICON} size={13} className="pdf-style-button__chevron" />
        </button>
        <input
          ref={colorRef}
          type="color"
          className="visually-hidden"
          tabIndex={-1}
          aria-label={t('pdfStyle.chooseColor')}
          value={customColor ?? lastColor}
          onChange={(e) => pickColor(e.target.value)}
        />
        {menuAnchor && (
          <MenuPopover radio label={t('pdfStyle.label')} anchor={menuAnchor} items={items} onClose={() => setMenuAnchor(null)} />
        )}
      </>
    );
  }

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
        <span className="pdf-style-button__label">{customColor ? t('pdfStyle.custom') : styleName(active.id)}</span>
        <span aria-hidden="true" className="pdf-style-button__chevron">▾</span>
      </button>
      {open && (
        <div className="pdf-style-sheet-backdrop" onClick={() => setOpen(false)}>
          <div
            className="pdf-style-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t('pdfStyle.label')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pdf-style-sheet__header">
              <h3>{t('pdfStyle.label')}</h3>
              <button type="button" className="pdf-style-sheet__done" onClick={() => setOpen(false)}>{t('actions.done', { ns: 'common' })}</button>
            </div>
            {list}
          </div>
        </div>
      )}
    </>
  );
};
