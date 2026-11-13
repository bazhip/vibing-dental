import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { promptDialog, confirmDialog, toast } from './ui/dialogs';

import { COLUMN_RANGES, scoreChoices } from '../constants/columnDefinitions';
import { ScoreChips } from './ScoreChips';
import {
  DataGrid,
  Column,
  RenderEditCellProps,
  DataGridHandle,
} from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { DentalField, Species, ToothData, ToothMarks } from '../types';
import type { ScoreTapMove } from '../utils/chartSettings';
import { rootLabels, rootBoxes, formatRootPockets } from '../utils/pocket';

interface DentalGridProps {
  /** View-only (saved visit not unlocked): cells, Missing and set-all are
   *  locked, but the grid still scrolls and can be read/copied. */
  readOnly?: boolean;
  toothData: ToothData[];
  onToothDataChange: (rows: ToothData[]) => void;
  /** Diagnosis-diagram marks — rows whose tooth is marked `missing` render
   *  crossed out, and the leading column's button toggles that mark. */
  toothMarks: ToothMarks;
  onToggleMissing: (triadan: number) => void;
  /** Tooth row to flash (AI autofill just edited it). */
  highlightTriadan?: number | null;
  /** The patient's previous visit, keyed by triadan — rendered as muted
   *  hints in empty cells and "Last visit" tooltips on filled ones.
   *  Reference only; hinted cells stay empty until typed into. */
  priorToothData?: Record<number, ToothData> | null;
  /** Teeth already gone (missing/extracted) at the previous visit — the
   *  new-visit flow pre-marks these missing; the Missing column badges
   *  them as carried forward rather than found today. */
  priorGoneTeeth?: Set<number> | null;
  /** Whether grid findings are mirrored onto the Diagnosis diagram as
   *  anchored comments (the checkbox in this section's header). */
  mirrorToDiagnosis?: boolean;
  onMirrorToDiagnosisChange?: (on: boolean) => void;
  /** Whether the PDF keeps the arch grids — offered only while findings
   *  are mirrored, since the diagram then carries the same data. */
  pdfIncludeGrid?: boolean;
  onPdfIncludeGridChange?: (on: boolean) => void;
  /** Rendered in the section header beside the title (the Grid / By
   *  tooth view switch). */
  headerAccessory?: React.ReactNode;
  /** Chart settings: columns to leave out, and one pocket box per root. */
  hiddenColumns?: DentalField[];
  pocketMode?: 'tooth' | 'root';
  /** Needed for per-root pockets (root counts differ by species). */
  species?: Species;
  /** Space moves down to the next tooth (default) vs. typing a space. */
  spaceMovesDown?: boolean;
  /** Where a tapped score moves to: next finding (default), next tooth,
   *  or stay on the cell. */
  scoreTapMoves?: ScoreTapMove;
}

/**
 * Data grid component for dental chart entry. A single click on any
 * editable cell starts typing; Excel-style key behavior throughout:
 *
 *   - Tab / Shift+Tab   commit and move to the next / previous cell
 *   - Enter             commit and move to the same column in the next row
 *   - Escape            cancel and discard the edit
 *
 * The grid ref exposes `setActivePosition(position, options)`, which is
 * how we drive the Enter-advances-row behavior — the cell editor commits
 * via `onClose(true)`, then we explicitly select the row below.
 *
 * Enter is also blocked from bubbling to the enclosing <form>, which
 * would otherwise submit and open the PDF preview modal.
 */

// Editable columns span idx 3 (mobility) … 10 (pdstate). Tab wraps
// forward to the next row's first editable column; Shift+Tab wraps
// back to the previous row's last editable column. Off-page edges
// are no-ops so focus stays in the grid.
const FIRST_EDITABLE = 3;

/** The bits of grid state the module-scope editor needs — refs only, so
 *  the editor component's identity never changes (recreating it per
 *  render made the grid remount its editor on every keystroke). */
interface EditorWiring {
  gridRef: React.RefObject<DataGridHandle | null>;
  rowCountRef: React.MutableRefObject<number>;
  /** Index of the last editable column (depends on hidden columns). */
  lastEditableRef: React.MutableRefObject<number>;
  speciesRef: React.MutableRefObject<Species>;
  /** Which root slot was clicked, so the per-root editor opens on it. */
  focusRootRef: React.MutableRefObject<number>;
  spaceMovesDownRef: React.MutableRefObject<boolean>;
  scoreTapMovesRef: React.MutableRefObject<ScoreTapMove>;
}

const EditorWiringContext = React.createContext<EditorWiring | null>(null);

/** Touch-first device (tablet, phone): tap targets matter more than
 *  keys, and the on-screen keyboard covers half the chart. */
const isCoarsePointer = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;

/** Where the score popover sits: under the cell, or above it when the
 *  cell is near the bottom of the screen. Fixed-positioned (portalled
 *  out of the grid, whose cells clip their content). */
function usePopoverPosition(anchor: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const [pos, setPos] = React.useState<{ top: number; left: number; above: boolean } | null>(null);
  React.useLayoutEffect(() => {
    if (!enabled) return;
    const place = () => {
      const el = anchor.current?.closest('.rdg-editor-container') ?? anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const above = window.innerHeight - r.bottom < 72 && r.top > 72;
      setPos({ top: above ? r.top - 4 : r.bottom + 4, left: Math.max(4, r.left), above });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchor, enabled]);
  return pos;
}

/** Plain input — measurements here are numeric grades (mobility, pocket
 *  depths, PD stage), so the dental-code autocomplete that CodeField
 *  provides elsewhere would only get in the way. Short-scale columns
 *  (mobility, furcation, calculus, gingivitis, PD stage) also get a row
 *  of tappable scores under the cell: a tap saves the score and opens
 *  the next tooth in the same column, so a column can be swept with one
 *  tap per tooth. Typing still works exactly as before. */
function CodeCellEditor({
  column,
  row,
  rowIdx,
  onRowChange,
  onClose,
}: RenderEditCellProps<ToothData>) {
  const wiring = React.useContext(EditorWiringContext);
  const key = column.key as keyof ToothData;
  const current = row[key];
  const value = typeof current === 'string' ? current : '';
  const lastRowIdx = (wiring?.rowCountRef.current ?? 0) - 1;
  const LAST_EDITABLE = wiring?.lastEditableRef.current ?? FIRST_EDITABLE;
  const choices = scoreChoices(key as string);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const popover = usePopoverPosition(inputRef, !!choices);
  // Keep the popover on screen: a cell near the right edge would push it
  // past the viewport (and make the whole page scroll sideways).
  React.useLayoutEffect(() => {
    const el = popRef.current;
    if (!el || !popover) return;
    const maxLeft = window.innerWidth - el.offsetWidth - 4;
    el.style.left = `${Math.max(4, Math.min(popover.left, maxLeft))}px`;
  });
  // On touch screens the scores cover every valid value, so keep the
  // on-screen keyboard down (a hardware keyboard still types).
  const [coarse] = React.useState(isCoarsePointer);

  const advance = (nextRow: number, nextIdx: number, enableEditor: boolean) => {
    if (nextRow < 0 || nextRow > lastRowIdx) return;
    queueMicrotask(() => {
      wiring?.gridRef.current?.setActivePosition(
        { rowIdx: nextRow, idx: nextIdx },
        { enableEditor, shouldFocus: true }
      );
    });
  };

  const handleKeyDown: React.KeyboardEventHandler = (e) => {
    if (e.key === 'Tab') {
      // Drive Tab navigation explicitly so it can wrap across rows —
      // left to the browser, Tab would leave the grid entirely.
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
      if (e.shiftKey) {
        if (column.idx > FIRST_EDITABLE) {
          advance(rowIdx, column.idx - 1, false);
        } else if (rowIdx > 0) {
          advance(rowIdx - 1, LAST_EDITABLE, false);
        }
      } else {
        if (column.idx < LAST_EDITABLE) {
          advance(rowIdx, column.idx + 1, false);
        } else if (rowIdx < lastRowIdx) {
          advance(rowIdx + 1, FIRST_EDITABLE, false);
        }
      }
      return;
    }
    if (e.key === 'Enter' || (e.key === ' ' && (wiring?.spaceMovesDownRef.current ?? true))) {
      // Commit, then move down a row in the same column — Enter, and
      // Space too unless the person's chart settings say Space types a
      // space, so a run of probing depths can be entered exactly as it's
      // called out ("3 [space] 2 [space] 4 …").
      // Enter is also blocked from bubbling to the form (which would
      // submit).
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
      advance(rowIdx + 1, column.idx, false);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose(false);
      return;
    }
  };

  const pickScore = (score: string) => {
    onRowChange({ ...row, [key]: score }, true);
    // Open the next cell's editor straight away (scores or number pad
    // showing), so the next tap is the next value.
    const move = wiring?.scoreTapMovesRef.current ?? 'finding';
    if (move === 'tooth') advance(rowIdx + 1, column.idx, true);
    else if (move === 'finding') {
      if (column.idx < LAST_EDITABLE) advance(rowIdx, column.idx + 1, true);
      else advance(rowIdx + 1, FIRST_EDITABLE, true);
    }
  };

  return (
    <>
    <input
      ref={inputRef}
      autoFocus
      value={value}
      inputMode={choices && coarse ? 'none' : 'decimal'}
      autoComplete="off"
      aria-label={`Tooth ${row.triadan} ${String(column.name)}`}
      onChange={(e) => onRowChange({ ...row, [key]: e.target.value })}
      onKeyDown={handleKeyDown}
      onBlur={() => onClose(true)}
      // Explicit surface colors so the editor matches the cell it sits
      // in regardless of the grid library's own theme variables.
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        padding: '0 0.4rem',
        background: '#ffffff',
        color: 'var(--text, #0f172a)',
        font: 'inherit',
        outline: 'none',
      }}
    />
    {choices && popover && createPortal(
      // Portalled, but still inside the editor in React's tree — so a
      // press here reaches the grid's own "click inside the editor"
      // handler and doesn't count as clicking away.
      <div
        ref={popRef}
        className={`dental-grid__score-pop${popover.above ? ' dental-grid__score-pop--above' : ''}`}
        style={{ top: popover.top }}
      >
        <ScoreChips
          name={`Tooth ${row.triadan} ${String(column.name)}`}
          choices={choices}
          value={value}
          onPick={pickScore}
          clearable
          keepFocus
        />
      </div>,
      document.body
    )}
    </>
  );
}

/** Per-root pocket editor: one small box per root ("M", "D" / "MB",
 *  "MP", "D"). Space or Tab steps to the next root; past the last root it
 *  moves on like the plain editor (Tab → next column, Enter → next row).
 *  Saves the labelled form ("M4 D6"). */
function PocketRootsEditor(props: RenderEditCellProps<ToothData>) {
  const { row, rowIdx, column, onRowChange, onClose } = props;
  const wiring = React.useContext(EditorWiringContext);
  const labels = rootLabels(wiring?.speciesRef.current ?? 'canine', row.triadan);
  const initial = React.useMemo(() => rootBoxes(labels, row.pocket), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [depths, setDepths] = React.useState<Record<string, string>>(initial.depths);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  // Open on the root slot that was clicked (keyboard entry: the first).
  const [startIndex] = React.useState(() => Math.min(Math.max(wiring?.focusRootRef.current ?? 0, 0), labels.length - 1));
  React.useEffect(() => { if (wiring) wiring.focusRootRef.current = 0; }, [wiring]);
  const lastRowIdx = (wiring?.rowCountRef.current ?? 0) - 1;
  const LAST_EDITABLE = wiring?.lastEditableRef.current ?? FIRST_EDITABLE;

  const write = (next: Record<string, string>) => {
    setDepths(next);
    onRowChange({ ...row, pocket: formatRootPockets(labels, next) });
  };
  const go = (nextRow: number, nextIdx: number) => {
    if (nextRow < 0 || nextRow > lastRowIdx) return;
    queueMicrotask(() => {
      wiring?.gridRef.current?.setActivePosition({ rowIdx: nextRow, idx: nextIdx }, { enableEditor: false, shouldFocus: true });
    });
  };
  const leave = (dir: 'next' | 'prev' | 'down') => {
    onClose(true);
    if (dir === 'down') go(rowIdx + 1, column.idx);
    else if (dir === 'prev') {
      if (column.idx > FIRST_EDITABLE) go(rowIdx, column.idx - 1);
      else if (rowIdx > 0) go(rowIdx - 1, LAST_EDITABLE);
    } else if (column.idx < LAST_EDITABLE) go(rowIdx, column.idx + 1);
    else if (rowIdx < lastRowIdx) go(rowIdx + 1, FIRST_EDITABLE);
  };
  const onKey = (i: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? -1 : 1;
      const target = inputs.current[i + step];
      if (target) target.focus();
      else leave(e.shiftKey ? 'prev' : 'next');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      leave('down');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose(false);
    }
  };
  return (
    <div
      className="dental-grid__roots"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onClose(true); }}
    >
      {labels.map((l, i) => (
        <label key={l} className="dental-grid__root">
          <span className="dental-grid__root-label">{l}</span>
          <input
            ref={(el) => { inputs.current[i] = el; }}
            autoFocus={i === startIndex}
            inputMode="decimal"
            value={depths[l] ?? ''}
            aria-label={`Tooth ${row.triadan} pocket, ${l} root`}
            onChange={(e) => write({ ...depths, [l]: e.target.value.replace(/[^\d.]/g, '') })}
            onKeyDown={onKey(i)}
          />
        </label>
      ))}
    </div>
  );
}

/** Pocket cells: per-root boxes on multi-rooted teeth when the practice
 *  charts per root. A plain value that can't be placed on roots keeps
 *  the plain editor, so nothing is lost — clear it to get the boxes. */
function PocketCellEditor(props: RenderEditCellProps<ToothData>) {
  const wiring = React.useContext(EditorWiringContext);
  const labels = rootLabels(wiring?.speciesRef.current ?? 'canine', props.row.triadan);
  if (labels.length === 0 || rootBoxes(labels, props.row.pocket).unplaced) return <CodeCellEditor {...props} />;
  return <PocketRootsEditor {...props} />;
}

// Column shares of the grid width. Resolved to NUMERIC pixel widths
// before they reach react-data-grid: the library re-measures string
// widths ('8%') in a layout effect that can feed back into itself
// ("Maximum update depth exceeded" via updateMeasuredAndResizedWidths)
// — numeric widths never enter that code path. The floor is 760px
// (matching the ≤1000px horizontal-scroll CSS) so narrow screens
// scroll instead of crushing columns.
const MIN_LAYOUT_WIDTH = 760;

// `short`: the title used when full ones would be cut off ("MOBILIT",
// "RECESSIO") — phones, small tablets and narrow windows.
const CODE_COLUMNS: Array<{ key: keyof ToothData; name: string; share: number; short: string }> = [
  { key: 'mobility',    name: 'Mobility',    share: 0.08, short: 'Mob', },
  { key: 'recession',   name: 'Recession',   share: 0.09, short: 'Rec', },
  { key: 'pocket',      name: 'Pocket',      share: 0.08, short: 'Pocket' },
  { key: 'furcation',   name: 'Furcation',   share: 0.10, short: 'Furc', },
  { key: 'hyperplasia', name: 'Enlargement', share: 0.12, short: 'Enl', },
  { key: 'calculus',    name: 'Calculus',    share: 0.09, short: 'Calc', },
  { key: 'gingivitis',  name: 'Gingivitis',  share: 0.11, short: 'Ging', },
  // pdstate's share is nominal — as the last column it takes whatever
  // slack is left so the columns always total the container exactly.
  { key: 'pdstate',     name: 'PD State',    share: 0.12, short: 'Stage', },
];

/** Missing · Tooth · Triadan on narrow screens: compact, and frozen so
 *  the tooth stays in view while the findings scroll sideways. */
// Missing is wide enough to say "MISSING" (a bare ✕ didn't read as
// missing — and in dental charting ✕ suggests extracted); Tooth is just
// wide enough for "M3" / "P4" (its title spans Tooth + Triadan).
const MISSING_MIN = 62;
const NARROW_LEAD = [MISSING_MIN, 36, 46] as const;
/** Matches the CSS breakpoint where the grid becomes its own scroller. */
const NARROW_QUERY = '(max-width: 1000px)';

/** Width a header needs for `label`: uppercase caption-size titles run
 *  ≈10.4px a letter (measured: "MOBILITY" is 81px), plus the cell's
 *  side padding and, on finding columns, the ⋯ set-all button and gap
 *  (28px square on touch screens, 18px otherwise). */
function headerWidth(label: string, opts: { button: boolean; narrow: boolean; coarse: boolean }): number {
  const padding = opts.narrow ? 13 : 16;
  const button = opts.button ? (opts.coarse ? 28 : 18) + 6 : 0;
  return Math.ceil(label.length * 10.4 + padding + button);
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(() => window.matchMedia?.(query).matches ?? false);
  React.useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return matches;
}

export const DentalGrid: React.FC<DentalGridProps> = ({
  toothData,
  onToothDataChange,
  toothMarks,
  onToggleMissing,
  highlightTriadan,
  priorToothData,
  priorGoneTeeth,
  mirrorToDiagnosis,
  onMirrorToDiagnosisChange,
  pdfIncludeGrid,
  onPdfIncludeGridChange,
  readOnly = false,
  headerAccessory,
  hiddenColumns,
  pocketMode = 'tooth',
  species = 'canine',
  spaceMovesDown = true,
  scoreTapMoves = 'finding',
}) => {
  const gridRef = useRef<DataGridHandle>(null);
  const rowCountRef = useRef(toothData.length);
  rowCountRef.current = toothData.length;
  // Columns shown (chart settings may hide some). Leading columns:
  // Missing, Tooth, Triadan — so the editable ones start at index 3.
  const visibleColumns = React.useMemo(() => {
    const hidden = new Set(hiddenColumns ?? []);
    const shown = CODE_COLUMNS.filter((c) => !hidden.has(c.key as DentalField));
    // Per-root pockets need room for up to three small boxes.
    return shown.map((c) => (c.key === 'pocket' && pocketMode === 'root' ? { ...c, share: 0.17 } : c));
  }, [hiddenColumns, pocketMode]);
  const narrow = useMediaQuery(NARROW_QUERY);
  const coarse = useMediaQuery('(pointer: coarse)');
  const headOpts = { button: !readOnly, narrow, coarse };
  // Narrow screens lay out each finding column just wide enough for its
  // short title (the card scrolls sideways); wider ones fill the
  // container. Per-root pockets need room for up to three boxes.
  const narrowWidth = (c: { key: keyof ToothData; short: string }) =>
    Math.max(headerWidth(c.short, headOpts), c.key === 'pocket' && pocketMode === 'root' ? 132 : 60);
  const narrowMinWidth = NARROW_LEAD.reduce((a, b) => a + b, 0) + visibleColumns.reduce((sum, c) => sum + narrowWidth(c), 0) + 2;
  const lastEditableRef = useRef(FIRST_EDITABLE + visibleColumns.length - 1);
  lastEditableRef.current = FIRST_EDITABLE + visibleColumns.length - 1;
  const speciesRef = useRef<Species>(species);
  speciesRef.current = species;
  const focusRootRef = useRef(0);
  const spaceMovesDownRef = useRef(spaceMovesDown);
  spaceMovesDownRef.current = spaceMovesDown;
  const scoreTapMovesRef = useRef<ScoreTapMove>(scoreTapMoves);
  scoreTapMovesRef.current = scoreTapMoves;
  const wiring = React.useMemo<EditorWiring>(() => ({ gridRef, rowCountRef, lastEditableRef, speciesRef, focusRootRef, spaceMovesDownRef, scoreTapMovesRef }), []);

  // Container width for the numeric column widths. Integer-rounded and
  // only committed on change, so subpixel ResizeObserver reports can't
  // churn renders. The default carries jsdom/hidden-panel mounts until
  // the observer reports a real width (no remount — columns just update).
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(1100);
  React.useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const measure = () => {
      const width = Math.round(el.offsetWidth);
      if (width > 0) setContainerWidth((prev) => (prev === width ? prev : width));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Narrow screens: the card scrolls sideways, which stops its header
  // sticking to the page. A fixed-position copy of the header takes over
  // under the app topbar while the grid is scrolled past. Fixed elements
  // ride the compositor on iOS, so it stays rock-steady during scrolling
  // (moving the real header from scroll events trailed a frame behind and
  // shook). Script only shows/hides it at the grid's edges and slides its
  // columns sideways with the card.
  const floatRef = useRef<HTMLDivElement>(null);
  const floatTrackRef = useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = wrapperRef.current;
    const fl = floatRef.current;
    const track = floatTrackRef.current;
    if (!narrow || !el || !fl || !track) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const topbar = parseFloat(getComputedStyle(el).getPropertyValue('--topbar-height')) || 0;
      // Keyboard up: iOS pans the visible area down the page and the
      // topbar goes with it — sit at the top of what's visible instead.
      const top = Math.max(topbar, window.visualViewport?.offsetTop ?? 0);
      const head = (el.querySelector('.rdg-header-row .rdg-cell') as HTMLElement | null)?.offsetHeight ?? 44;
      const show = r.top < top && r.bottom > top + head * 2;
      fl.style.display = show ? 'flex' : 'none';
      if (show) {
        fl.style.top = `${Math.round(top)}px`;
        fl.style.left = `${Math.round(r.left + el.clientLeft)}px`;
        fl.style.width = `${el.clientWidth}px`;
        fl.style.height = `${head}px`;
      }
    };
    const sync = () => { track.style.transform = `translateX(${-el.scrollLeft}px)`; };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
    place();
    sync();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    el.addEventListener('scroll', sync, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      el.removeEventListener('scroll', sync);
      fl.style.display = 'none';
    };
  }, [narrow]);
  // -2 for the card's side borders; floor keeps parity with the
  // horizontal-scroll breakpoint.
  const layoutWidth = Math.max(containerWidth, narrow ? narrowMinWidth : MIN_LAYOUT_WIDTH) - 2;

  // Whole-mouth scoring (calculus, gingivitis, …): one value applied to
  // every chartable tooth from the column header. Refs keep the handler
  // identity stable so the memoized columns survive edits.
  const toothDataRef = useRef(toothData);
  toothDataRef.current = toothData;
  const toothMarksRef = useRef(toothMarks);
  toothMarksRef.current = toothMarks;
  const setAllForColumn = React.useCallback(async (key: keyof ToothData, name: string) => {
    const range = COLUMN_RANGES[key as string];
    const input = await promptDialog({
      title: `Set ${name} for every tooth`,
      message: `Applies to every tooth not marked missing.${range ? ` Use a number from ${range[0]} to ${range[1]}.` : ''} Leave it empty to clear the column.`,
      label: name,
      placeholder: range ? `${range[0]}–${range[1]}` : '',
      confirmLabel: 'Apply to all',
      validate: (v) => {
        const t = v.trim();
        if (!t) return null; // empty = clear (confirmed next)
        if (range && !t.split(/\s+/).every((n) => /^\d+(\.\d+)?$/.test(n) && Number(n) >= range[0] && Number(n) <= range[1])) {
          return `${name} must be a number from ${range[0]} to ${range[1]}.`;
        }
        return null;
      },
    });
    if (input === null) return;
    if (!input.trim()) { await clearColumn(key, name); return; }
    applyColumn(key, name, input.trim());
  }, // eslint-disable-next-line react-hooks/exhaustive-deps
  [onToothDataChange]);

  /** Write one value to a column for every present tooth, with Undo. */
  const applyColumn = (key: keyof ToothData, name: string, value: string) => {
    const before = toothDataRef.current;
    onToothDataChange(
      before.map((t) => (toothMarksRef.current[t.triadan] === 'missing' ? t : { ...t, [key]: value }))
    );
    toast(value ? `${name} set to ${value} on every tooth.` : `${name} cleared on every tooth.`, {
      kind: 'success',
      action: { label: 'Undo', onClick: () => onToothDataChange(before) },
    });
  };

  const clearColumn = React.useCallback(async (key: keyof ToothData, name: string) => {
    const filled = toothDataRef.current.filter((t) => String(t[key] ?? '').trim()).length;
    if (filled === 0) return;
    if (!(await confirmDialog({
      title: `Clear ${name} for every tooth?`,
      message: `Removes ${filled} ${filled === 1 ? 'value' : 'values'} from the ${name} column.`,
      confirmLabel: 'Clear column',
      danger: true,
    }))) return;
    applyColumn(key, name, '');
  }, // eslint-disable-next-line react-hooks/exhaustive-deps
  [onToothDataChange]);

  // Several teeth at once: click Tooth/Triadan cells to select teeth
  // (Shift-click for a range), then set one value on all of them.
  const [selected, setSelected] = React.useState<Set<number>>(() => new Set());
  const anchorRef = useRef<number | null>(null);
  const [bulkKey, setBulkKey] = React.useState<keyof ToothData>('gingivitis');
  const [bulkValue, setBulkValue] = React.useState('');
  // A different chart (new rows) or view-only: drop the selection.
  React.useEffect(() => { setSelected(new Set()); anchorRef.current = null; }, [readOnly, toothData.length]);
  const toggleSelect = (triadan: number, range: boolean) => {
    // Read the anchor now: the state updater runs later, after the anchor
    // has moved to this click.
    const anchor = anchorRef.current;
    const order = toothDataRef.current.map((t) => t.triadan);
    setSelected((prev) => {
      const next = new Set(prev);
      if (range && anchor != null && order.includes(anchor)) {
        const [a, b] = [order.indexOf(anchor), order.indexOf(triadan)].sort((x, y) => x - y);
        for (const t of order.slice(a, b + 1)) next.add(t);
      } else if (next.has(triadan)) {
        next.delete(triadan);
      } else {
        next.add(triadan);
      }
      return next;
    });
    anchorRef.current = triadan;
  };
  const bulkColumn = visibleColumns.find((c) => c.key === bulkKey) ?? visibleColumns[0];
  const bulkRange = bulkColumn ? COLUMN_RANGES[bulkColumn.key as string] : undefined;
  const bulkError = (() => {
    const t = bulkValue.trim();
    if (!t || !bulkRange) return '';
    const ok = t.split(/\s+/).every((n) => /^\d+(\.\d+)?$/.test(n) && Number(n) >= bulkRange[0] && Number(n) <= bulkRange[1]);
    return ok ? '' : `Use ${bulkRange[0]}–${bulkRange[1]}`;
  })();
  const applyToSelected = () => {
    if (!bulkColumn || !bulkValue.trim() || bulkError) return;
    const key = bulkColumn.key;
    const value = bulkValue.trim();
    const before = toothDataRef.current;
    const targets = before.filter((t) => selected.has(t.triadan) && toothMarksRef.current[t.triadan] !== 'missing');
    if (targets.length === 0) return;
    const ids = new Set(targets.map((t) => t.triadan));
    onToothDataChange(before.map((t) => (ids.has(t.triadan) ? { ...t, [key]: value } : t)));
    toast(`${bulkColumn.name} set to ${value} on ${targets.length} ${targets.length === 1 ? 'tooth' : 'teeth'}.`, {
      kind: 'success',
      action: { label: 'Undo', onClick: () => onToothDataChange(before) },
    });
    setBulkValue('');
  };

  // Gloved fingers on tablets need taller touch targets than a mouse.
  const coarsePointer = React.useMemo(
    () => window.matchMedia?.('(pointer: coarse)').matches ?? false,
    []
  );

  const columns = React.useMemo((): readonly Column<ToothData>[] => {
    const px = (share: number) => Math.floor(layoutWidth * share);
    // Shown columns split the width the full set would have used, so
    // hiding some widens the rest instead of leaving a gap.
    const fullShare = CODE_COLUMNS.reduce((sum, c) => sum + c.share, 0);
    const shownShare = visibleColumns.reduce((sum, c) => sum + c.share, 0) || 1;
    const scale = fullShare / shownShare;
    // Desktop headers use wider letter-spacing, so "MISSING" needs a little more.
    const lead = narrow ? NARROW_LEAD : [Math.max(px(0.06), MISSING_MIN + 8), px(0.07), px(0.08)];
    const colWidth = (c: (typeof visibleColumns)[number]) => (narrow ? narrowWidth(c) : px(c.share * scale));
    const fixedTotal =
      lead[0] + lead[1] + lead[2] +
      visibleColumns.slice(0, -1).reduce((sum, column) => sum + colWidth(column), 0);
    const lastColumnWidth = Math.max(layoutWidth - fixedTotal, 60);
    const widthOf = (index: number) =>
      index === visibleColumns.length - 1 ? lastColumnWidth : colWidth(visibleColumns[index]);
    // One style across the row: if any finding's full title would be
    // cut off, every finding column uses its short title.
    const fits = (label: string, width: number, button = !readOnly) => headerWidth(label, { ...headOpts, button }) <= width;
    const fullTitles = visibleColumns.every((c, i) => fits(c.name, widthOf(i)));
    return [
    {
      key: 'missing',
      name: 'Missing',
      width: lead[0],
      minWidth: lead[0], // the grid's default 50px floor would change the compact widths
      // Pinned left on narrow screens (our own sticky CSS — the grid's
      // `frozen` renders frozen cells twice when virtualization is off).
      cellClass: narrow ? 'dental-grid__pin dental-grid__pin--0' : undefined,
      headerCellClass: `dental-grid__head--missing${narrow ? ' dental-grid__pin dental-grid__pin--0' : ''}`,
      renderHeaderCell: () => 'Missing',
      renderCell: ({ row }) => {
        const isMissing = toothMarks[row.triadan] === 'missing';
        const carried = isMissing && !!priorGoneTeeth?.has(row.triadan);
        return (
          <label className="dental-grid__missing-hit">
            <input
              type="checkbox"
              className="dental-grid__missing-check"
              checked={isMissing}
              disabled={readOnly}
              onChange={() => onToggleMissing(row.triadan)}
              aria-label={`Tooth ${row.triadan} missing${carried ? ' (carried from the previous visit)' : ''}`}
              title={
                carried
                  ? `Tooth ${row.triadan} was already missing or extracted at the previous visit — carried forward automatically`
                  : isMissing
                  ? `Unmark tooth ${row.triadan} as missing`
                  : `Mark tooth ${row.triadan} as missing — crosses out this row and fills the tooth on the Diagnosis diagram`
              }
            />
            {carried && (
              <span className="dental-grid__prior-chip" aria-hidden="true">
                prev
              </span>
            )}
          </label>
        );
      },
    },
    {
      key: 'tooth',
      name: 'Tooth',
      width: lead[1],
      minWidth: lead[1], // the grid's default 50px floor would widen the compact columns
      // Narrow (or "Tooth" doesn't fit): one title over both Tooth and
      // Triadan, so neither column needs room for a title of its own.
      colSpan: narrow || !fits('Tooth', lead[1], false) ? (args) => (args.type === 'HEADER' ? 2 : undefined) : undefined,
      // Pinned left on narrow screens (our own sticky CSS — the grid's
      // `frozen` renders frozen cells twice when virtualization is off).
      cellClass: narrow ? 'dental-grid__pin dental-grid__pin--1' : undefined,
      headerCellClass: narrow ? 'dental-grid__pin dental-grid__pin--1' : undefined,
      // Deciduous rows store lowercase labels (i1, c, p2 — standard
      // notation), but read better capitalized in the on-screen grid.
      renderCell: ({ row }) => (
        <span className="dental-grid__pick" title={readOnly ? undefined : 'Click to select this tooth (Shift-click for a range) and set a value on several at once'}>
          {(row.tooth ?? '').toUpperCase()}
        </span>
      ),
    },
    {
      key: 'triadan',
      name: 'Triadan',
      width: lead[2],
      minWidth: lead[2], // the grid's default 50px floor would widen the compact columns
      // Pinned left on narrow screens (our own sticky CSS — the grid's
      // `frozen` renders frozen cells twice when virtualization is off).
      cellClass: narrow ? 'dental-grid__pin dental-grid__pin--2' : undefined,
      headerCellClass: narrow ? 'dental-grid__pin dental-grid__pin--2' : undefined,
      renderHeaderCell: () => (fits('Triadan', lead[2], false) ? 'Triadan' : <span title="Triadan" aria-label="Triadan">#</span>),
      renderCell: ({ row }) => (
        <span className="dental-grid__pick" title={readOnly ? undefined : 'Click to select this tooth (Shift-click for a range) and set a value on several at once'}>
          {row.triadan}
        </span>
      ),
    },
    ...visibleColumns.map(({ key, name, short }, index): Column<ToothData> => {
      const width = widthOf(index);
      const fullTitle = key === 'pocket' && pocketMode === 'root' ? `${name} (per root)` : name;
      // Short titles whenever full ones would be cut off (phones, small
      // tablets, narrow windows).
      const title = !fullTitles ? short : fits(fullTitle, width) ? fullTitle : name;
      return {
      key,
      name,
      width,
      renderEditCell: readOnly ? undefined : key === 'pocket' && pocketMode === 'root' ? PocketCellEditor : CodeCellEditor,
      // Teeth marked missing have nothing to measure.
      editable: (row: ToothData) => !readOnly && toothMarks[row.triadan] !== 'missing',
      renderCell: ({ row }) => {
        const value = typeof row[key] === 'string' ? (row[key] as string) : '';
        const prior = priorToothData?.[row.triadan]?.[key];
        const priorValue = typeof prior === 'string' ? prior.trim() : '';
        // Per-root pockets: always show a labelled slot per root, so the
        // expected input is visible before anything is typed. Clicking a
        // slot opens the editor on that root.
        if (key === 'pocket' && pocketMode === 'root' && toothMarks[row.triadan] !== 'missing') {
          const labels = rootLabels(species, row.triadan);
          const boxes = labels.length ? rootBoxes(labels, value) : null;
          if (boxes && !boxes.unplaced) {
            const priorBoxes = priorValue ? rootBoxes(labels, priorValue).depths : {};
            return (
              <span className="dental-grid__slots">
                {labels.map((l, i) => {
                  const d = boxes.depths[l];
                  const hint = priorBoxes[l];
                  return (
                    <span
                      key={l}
                      className={`dental-grid__slot${d ? '' : ' dental-grid__slot--empty'}`}
                      onMouseDown={() => { focusRootRef.current = i; }}
                      title={hint ? `${l} root — last visit ${hint}` : `${l} root`}
                    >
                      <span className="dental-grid__slot-label">{l}</span>
                      <span className={`dental-grid__slot-value${!d && hint ? ' dental-grid__prior-hint' : ''}`}>{d || hint || ''}</span>
                    </span>
                  );
                })}
              </span>
            );
          }
          if (boxes?.unplaced) {
            // Old single value on a multi-rooted tooth: say it isn't split.
            return <span title="Not split by root — click to edit (clear it to get a box per root)">{value} <span className="dental-grid__unsplit">all roots</span></span>;
          }
        }
        if (value) {
          // Entered — surface the previous visit's value for comparison
          // when it differs (probing-depth trends at a glance).
          return priorValue && priorValue !== value
            ? <span title={`Last visit: ${priorValue}`}>{value}</span>
            : <>{value}</>;
        }
        return priorValue ? (
          <span className="dental-grid__prior-hint" title={`Last visit: ${priorValue} — shown for reference, not carried forward`}>
            {priorValue}
          </span>
        ) : null;
      },
      renderHeaderCell: () => (
        <span className="dental-grid__head" title={title !== fullTitle ? fullTitle : undefined}>
          {title === fullTitle ? title : <span aria-label={fullTitle}>{title}</span>}
          <button
            type="button"
            className="dental-grid__set-all"
            hidden={readOnly}
            onClick={() => setAllForColumn(key, name)}
            title={`Set ${name} for every tooth at once`}
            aria-label={`Set ${name} for every tooth at once`}
          >
            ⋯
          </button>
        </span>
      ),
      };
    }),
    ];
  }, [toothMarks, onToggleMissing, setAllForColumn, priorToothData, priorGoneTeeth, layoutWidth, readOnly, visibleColumns, pocketMode, species, narrow, coarse]);

  return (
    <div className="dental-grid-section">
      <div className="dental-grid__section-header">
        <h2 className="dental-grid__title">Charting</h2>
        {headerAccessory}
        {onMirrorToDiagnosisChange && (
          <div className="dental-grid__options">
            <label
              className="dental-grid__option"
              title="Adds a comment on each charted tooth in the Diagnosis diagram and keeps it updated as you chart. Your own comments are left alone."
            >
              <input
                type="checkbox"
                checked={!!mirrorToDiagnosis}
                onChange={(e) => onMirrorToDiagnosisChange(e.target.checked)}
              />
              Show findings on Diagnosis diagram
            </label>
            {onPdfIncludeGridChange && (
              <label
                className={`dental-grid__option${mirrorToDiagnosis ? '' : ' dental-grid__option--disabled'}`}
                title={
                  mirrorToDiagnosis
                    ? 'Untick to leave the arch grids off the PDF — the Diagnosis diagram already shows these findings, and gets the extra room.'
                    : 'Available when findings are shown on the Diagnosis diagram.'
                }
              >
                <input
                  type="checkbox"
                  checked={!mirrorToDiagnosis || !!pdfIncludeGrid}
                  disabled={!mirrorToDiagnosis}
                  onChange={(e) => onPdfIncludeGridChange(e.target.checked)}
                />
                Include grid in PDF
              </label>
            )}
          </div>
        )}
      </div>
      {!readOnly && (selected.size > 0 ? (
        <div className="dental-grid__bulk" role="region" aria-label="Set a value on the selected teeth">
          <strong>{selected.size} {selected.size === 1 ? 'tooth' : 'teeth'} selected</strong>
          <label className="dental-grid__bulk-field">
            Set
            <select value={bulkColumn?.key as string} onChange={(e) => setBulkKey(e.target.value as keyof ToothData)} aria-label="Column to set">
              {visibleColumns.map((c) => <option key={c.key as string} value={c.key as string}>{c.name}</option>)}
            </select>
          </label>
          <label className="dental-grid__bulk-field">
            to
            <input
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyToSelected(); } }}
              inputMode="decimal"
              placeholder={bulkRange ? `${bulkRange[0]}–${bulkRange[1]}` : ''}
              aria-label="Value"
              aria-invalid={bulkError ? true : undefined}
            />
          </label>
          <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={applyToSelected} disabled={!bulkValue.trim() || !!bulkError}>
            Apply
          </button>
          <button type="button" className="diagram-view__action" onClick={() => { setSelected(new Set()); anchorRef.current = null; }}>
            Clear selection
          </button>
          {bulkError && <span className="dental-grid__bulk-error">{bulkError}</span>}
        </div>
      ) : (
        <p className="dental-grid__bulk-hint">Tip: click tooth numbers to select several teeth (Shift-click for a range), then set one value on all of them.</p>
      ))}
      {narrow && createPortal(
        // Visual stand-in for the header while it's scrolled away (the
        // real one stays in the grid for screen readers).
        <div ref={floatRef} className="dental-grid__float-head" aria-hidden="true" style={{ display: 'none' }}>
          <div className="dental-grid__float-pinned">
            <div className="dental-grid__float-cell dental-grid__head--missing" style={{ width: NARROW_LEAD[0] }}>Missing</div>
            <div className="dental-grid__float-cell" style={{ width: NARROW_LEAD[1] + NARROW_LEAD[2] }}>Tooth</div>
          </div>
          <div className="dental-grid__float-viewport">
            <div ref={floatTrackRef} className="dental-grid__float-track">
              {columns.slice(3).map((c) => (
                <div key={String(c.key)} className="dental-grid__float-cell" style={{ width: c.width as number }}>
                  {c.renderHeaderCell
                    ? (c.renderHeaderCell as (p: unknown) => React.ReactNode)({ column: c, sortDirection: undefined, priority: undefined, tabIndex: -1 })
                    : String(c.name)}
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
      <div
        className="dental-grid"
        ref={wrapperRef}
        style={narrow ? ({
          '--grid-min-width': `${narrowMinWidth - 2}px`,
          '--pin-1': `${NARROW_LEAD[0]}px`,
          '--pin-2': `${NARROW_LEAD[0] + NARROW_LEAD[1]}px`,
        } as React.CSSProperties) : undefined}
      >
        <EditorWiringContext.Provider value={wiring}>
          <DataGrid
            ref={gridRef}
            // Pin the light theme: react-data-grid's stylesheet otherwise
            // switches its internal vars to a dark palette when the OS is
            // in dark mode, turning the cell editor into a black box.
            className="rdg-light"
            columns={columns}
            rows={toothData}
            rowHeight={coarsePointer ? 44 : 35}
            onRowsChange={onToothDataChange}
            rowKeyGetter={(row: ToothData) => row.triadan}
            // Single click puts an editable cell straight into edit mode —
            // one tap per measurement chairside, no double-click dance.
            // Non-editable columns just select (setActivePosition(true)
            // is a plain focus when the column has no editor).
            onCellClick={(args, event) => {
              // Tooth / Triadan cells select teeth for "set on several".
              if (!readOnly && (args.column.key === 'tooth' || args.column.key === 'triadan')) {
                toggleSelect(args.row.triadan, event.shiftKey);
                return;
              }
              args.setActivePosition(true);
            }}
            // 42 rows at most — the page scrolls, the grid doesn't, so
            // virtualization would only fight the sticky-header layout.
            enableVirtualization={false}
            rowClass={(row: ToothData) =>
              [
                toothMarks[row.triadan] === 'missing' ? 'dental-grid__row--missing' : '',
                row.triadan === highlightTriadan ? 'dental-grid__row--ai' : '',
                selected.has(row.triadan) ? 'dental-grid__row--selected' : '',
              ].filter(Boolean).join(' ') || undefined
            }
          />
        </EditorWiringContext.Provider>
      </div>
    </div>
  );
};
