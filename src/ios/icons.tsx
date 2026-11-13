import React from 'react';

/**
 * SF-Symbols-style glyphs for the iOS app chrome, drawn on a 24×24 grid
 * with round caps and joins so they sit next to system text like the real
 * symbols do. Every icon follows currentColor. Icons with a `filled`
 * variant (used by the tab bar for the selected tab) draw a solid
 * silhouette with interior details knocked out through a mask.
 *
 * Decorative by default (aria-hidden); pass `title` to make one an image
 * with an accessible name.
 */

export const ICON_NAMES = [
  'chevron-left',
  'chevron-right',
  'chevron-down',
  'xmark',
  'ellipsis-circle',
  'square-and-arrow-up',
  'doc-text',
  'person-2',
  'calendar-badge-clock',
  'gear',
  'magnifyingglass',
  'line-3-horizontal-decrease',
  'mic',
  'plus',
  'minus',
  'trash',
  'arrow-uturn-backward',
  'arrow-uturn-forward',
  'checkmark',
  'checkmark-circle',
  'exclamationmark-circle',
  'bell',
  'clock-arrow-circlepath',
  'sidebar-left',
  'tooth',
  'camera',
  'photo',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

interface Spec {
  /** Stroked outline (fill none, stroke currentColor). */
  outline: React.ReactNode;
  /** Black shapes cut out of the outline (e.g. a gap around a badge). */
  outlineCut?: React.ReactNode;
  /** Stroked shapes drawn over the outline, outside its mask (the badge). */
  outlineExtra?: React.ReactNode;
  /** Solid silhouette for the filled variant. */
  solid?: React.ReactNode;
  /** Black shapes cut out of the solid silhouette (interior details). */
  solidCut?: React.ReactNode;
}

/** A filled dot inside an otherwise stroked outline. */
const dot = (cx: number, cy: number, r: number, key?: string) => (
  <circle key={key} cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
);
/** A cut line/shape drawn into a mask. */
const cut = (d: string, w = 1.8) => <path d={d} fill="none" stroke="#000" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;

/** Eight-tooth cog, centred on 12,12. */
function gearPath(): string {
  const teeth = 8;
  const R = 10.2;
  const r = 7.9;
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const step = Math.PI / teeth;
    const at = (rad: number, ang: number) => `${(12 + rad * Math.cos(ang)).toFixed(2)} ${(12 + rad * Math.sin(ang)).toFixed(2)}`;
    pts.push(at(r, a - step * 0.62), at(R, a - step * 0.34), at(R, a + step * 0.34), at(r, a + step * 0.62));
  }
  return `M${pts.join('L')}Z`;
}
const GEAR = gearPath();

const DOC = 'M6.5 2.5h7.25L19 7.75V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1.5-1.5z';
const TOOTH =
  'M7.6 3.2C5 3.2 3.5 5.3 3.5 8.1c0 2.2.8 3.7 1.5 5.3.6 1.4.8 3 1.1 4.6.3 1.7.8 3.6 2.1 3.6 1.6 0 1.7-2.5 2.1-4.4.3-1.4.7-2.3 1.7-2.3s1.4.9 1.7 2.3c.4 1.9.5 4.4 2.1 4.4 1.3 0 1.8-1.9 2.1-3.6.3-1.6.5-3.2 1.1-4.6.7-1.6 1.5-3.1 1.5-5.3 0-2.8-1.5-4.9-4.1-4.9-1.8 0-2.7 1-4.4 1s-2.6-1-4.4-1z';
const BELL = 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z';
const CAMERA = 'M3 8.5a2 2 0 0 1 2-2h2.6l1.6-2.2h5.6l1.6 2.2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';

const SPECS: Record<IconName, Spec> = {
  'chevron-left': { outline: <path d="M15 4.5 7.5 12l7.5 7.5" strokeWidth={2.4} /> },
  'chevron-right': { outline: <path d="M9 4.5 16.5 12 9 19.5" strokeWidth={2.4} /> },
  'chevron-down': { outline: <path d="M5.5 9 12 15.5 18.5 9" strokeWidth={2.4} /> },
  xmark: { outline: <path d="M6 6l12 12M18 6 6 18" strokeWidth={2.2} /> },
  'ellipsis-circle': {
    outline: <><circle cx="12" cy="12" r="9.5" />{dot(7.6, 12, 1.4, 'a')}{dot(12, 12, 1.4, 'b')}{dot(16.4, 12, 1.4, 'c')}</>,
    solid: <circle cx="12" cy="12" r="10.3" />,
    solidCut: <>{[7.6, 12, 16.4].map((x) => <circle key={x} cx={x} cy={12} r={1.5} fill="#000" />)}</>,
  },
  'square-and-arrow-up': {
    outline: <path d="M8.5 9.5H7A2 2 0 0 0 5 11.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7.5a2 2 0 0 0-2-2h-1.5M12 14.5V2.8M8 6.5l4-4 4 4" />,
  },
  'doc-text': {
    outline: <><path d={DOC} /><path d="M13.75 2.5V7.75H19M8.5 12.5h7M8.5 16.25h7" /></>,
    solid: <path d={DOC} />,
    solidCut: <>{cut('M13.75 2.2V7.75H19.4', 1.4)}{cut('M8.5 12.5h7M8.5 16.25h7')}</>,
  },
  'person-2': {
    outline: (
      <>
        <circle cx="9" cy="8" r="3.6" />
        <path d="M2.6 20.2c0-3.7 2.9-6.2 6.4-6.2s6.4 2.5 6.4 6.2" />
        <path d="M15.2 4.9a3.3 3.3 0 0 1 0 6.3M17.4 14.4c2.4.6 4 2.6 4 5.6" />
      </>
    ),
    solid: (
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M2 20.6c0-4 3.1-7 7-7s7 3 7 7a.9.9 0 0 1-.9.9H2.9a.9.9 0 0 1-.9-.9z" />
        <circle cx="16.4" cy="8.2" r="3.4" />
        <path d="M16.6 13.4c3.3.3 5.6 3 5.6 6.9a1 1 0 0 1-1 1h-3.9c.1-3.3-.5-5.9-2.4-7.7z" />
      </>
    ),
    solidCut: <><circle cx="9" cy="8" r="5.3" fill="none" stroke="#000" strokeWidth={1.2} /><path d="M1 20.6c0-4.6 3.6-8.3 8-8.3s8 3.7 8 8.3" fill="none" stroke="#000" strokeWidth={1.2} /></>,
  },
  'calendar-badge-clock': {
    outline: (
      <>
        <rect x="2.8" y="4.5" width="14.4" height="14.2" rx="2.6" />
        <path d="M2.8 9h14.4M6.8 2.6v3.6M13.2 2.6v3.6" />
      </>
    ),
    outlineCut: <circle cx="17.2" cy="17.2" r="6.3" fill="#000" />,
    outlineExtra: <><circle cx="17.2" cy="17.2" r="4.6" /><path d="M17.2 15v2.3l1.5 1" strokeWidth={1.5} /></>,
    solid: (
      <>
        <rect x="2.4" y="4" width="15.2" height="15.2" rx="2.8" />
        <rect x="5.9" y="1.8" width="1.8" height="4.4" rx=".9" />
        <rect x="12.3" y="1.8" width="1.8" height="4.4" rx=".9" />
        <circle cx="17.2" cy="17.2" r="5" />
      </>
    ),
    solidCut: (
      <>
        {cut('M2 9h16', 1.4)}
        <circle cx="17.2" cy="17.2" r="5.9" fill="none" stroke="#000" strokeWidth={1.4} />
        {cut('M17.2 14.9v2.4l1.5 1', 1.5)}
      </>
    ),
  },
  gear: {
    outline: <><path d={GEAR} /><circle cx="12" cy="12" r="3.1" /></>,
    solid: <path d={GEAR} strokeWidth={1.8} stroke="currentColor" strokeLinejoin="round" />,
    solidCut: <circle cx="12" cy="12" r="3.3" fill="#000" />,
  },
  magnifyingglass: { outline: <path d="M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.4 15.4 21 21" strokeWidth={2} /> },
  'line-3-horizontal-decrease': { outline: <path d="M3.5 6.5h17M6.5 12h11M9.5 17.5h5" strokeWidth={2} /> },
  mic: {
    outline: <><rect x="8.8" y="2.5" width="6.4" height="11.4" rx="3.2" /><path d="M5.3 11a6.7 6.7 0 0 0 13.4 0M12 17.7v3.5" /></>,
    solid: <><rect x="8.2" y="2" width="7.6" height="12.4" rx="3.8" /><path d="M5.3 11a6.7 6.7 0 0 0 13.4 0M12 17.7v3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" /></>,
  },
  plus: { outline: <path d="M12 4.5v15M4.5 12h15" strokeWidth={2.2} /> },
  minus: { outline: <path d="M4.5 12h15" strokeWidth={2.2} /> },
  trash: {
    outline: <path d="M3.8 6h16.4M9 6V4.6A1.6 1.6 0 0 1 10.6 3h2.8A1.6 1.6 0 0 1 15 4.6V6M6 6l.95 13.4A1.8 1.8 0 0 0 8.75 21h6.5a1.8 1.8 0 0 0 1.8-1.6L18 6M10 10.2v6.6M14 10.2v6.6" />,
  },
  'arrow-uturn-backward': { outline: <path d="M8.5 14 4 9.5 8.5 5M4 9.5h10.5a5.5 5.5 0 0 1 0 11H11" strokeWidth={2} /> },
  'arrow-uturn-forward': { outline: <path d="M15.5 14 20 9.5 15.5 5M20 9.5H9.5a5.5 5.5 0 0 0 0 11H13" strokeWidth={2} /> },
  checkmark: { outline: <path d="M4.5 12.8 9.6 18 19.5 6" strokeWidth={2.4} /> },
  'checkmark-circle': {
    outline: <><circle cx="12" cy="12" r="9.5" /><path d="M7.8 12.4l2.8 2.8 5.6-6.4" /></>,
    solid: <circle cx="12" cy="12" r="10.3" />,
    solidCut: cut('M7.6 12.4l3 3 5.8-6.6', 2.2),
  },
  'exclamationmark-circle': {
    outline: <><circle cx="12" cy="12" r="9.5" /><path d="M12 7v6" strokeWidth={2.2} />{dot(12, 16.6, 1.3)}</>,
    solid: <circle cx="12" cy="12" r="10.3" />,
    solidCut: <>{cut('M12 6.8v6.4', 2.4)}<circle cx="12" cy="16.7" r="1.4" fill="#000" /></>,
  },
  bell: {
    outline: <><path d={BELL} /><path d="M9.8 21a2.3 2.3 0 0 0 4.4 0" /></>,
    solid: <><path d={BELL} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" /><path d="M9.6 20.4h4.8a2.4 2.4 0 0 1-4.8 0z" /></>,
  },
  'clock-arrow-circlepath': {
    outline: <path d="M3.6 12a8.4 8.4 0 1 0 2.5-6M3.4 3.4v3.8h3.8M12 7.4V12l3.1 2" />,
  },
  'sidebar-left': {
    outline: <><rect x="2.8" y="4.5" width="18.4" height="15" rx="2.8" /><path d="M9.4 4.5v15M5.4 8.4h1.6M5.4 11.4h1.6" /></>,
  },
  tooth: {
    outline: <path d={TOOTH} />,
    solid: <path d={TOOTH} stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />,
  },
  camera: {
    outline: <><path d={CAMERA} /><circle cx="12" cy="13" r="3.6" /></>,
    solid: <path d={CAMERA} />,
    solidCut: <circle cx="12" cy="13" r="3.6" fill="none" stroke="#000" strokeWidth={1.8} />,
  },
  photo: {
    outline: <><rect x="2.8" y="4.5" width="18.4" height="15" rx="2.8" /><path d="M3.4 17.4l5.1-5.1 4 4 2.6-2.6 5.6 5.4" /><circle cx="15.6" cy="9.2" r="1.7" /></>,
  },
};

export interface IconProps {
  name: IconName;
  /** Width and height in CSS px (= pt in the app). Default 22. */
  size?: number;
  /** Accessible name; omit for decorative icons next to a text label. */
  title?: string;
  /** Solid variant where one exists (tab bar selection); outline otherwise. */
  filled?: boolean;
  className?: string;
}

export function Icon({ name, size = 22, title, filled = false, className }: IconProps) {
  const id = React.useId();
  const spec = SPECS[name];
  const useSolid = filled && !!spec.solid;
  const maskId = `ios-icon-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const cutShapes = useSolid ? spec.solidCut : spec.outlineCut;
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true as const, focusable: 'false' as const };
  return (
    <svg
      className={`ios-icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      data-icon={name}
      data-filled={useSolid ? 'true' : undefined}
      {...a11y}
    >
      {cutShapes && (
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <rect width="24" height="24" fill="#fff" />
            {cutShapes}
          </mask>
        </defs>
      )}
      {useSolid ? (
        <g fill="currentColor" stroke="none" mask={cutShapes ? `url(#${maskId})` : undefined}>{spec.solid}</g>
      ) : (
        <g fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <g mask={cutShapes ? `url(#${maskId})` : undefined}>{spec.outline}</g>
          {spec.outlineExtra}
        </g>
      )}
    </svg>
  );
}
