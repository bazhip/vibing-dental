import React from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from './icons';
import {
  capturePointer,
  exitDelay,
  releasePointer,
  rubberBand,
  trapTab,
  useMediaQuery,
  VelocityTracker,
} from './gesture';

/**
 * iOS modal sheet.
 *
 * - Grabber; Cancel on the leading edge and Done on the trailing edge
 *   (HIG). Without a Cancel button there is an xmark close control, so
 *   there is always a visible way out.
 * - Swipe down to dismiss from the grabber/header anywhere, or from the
 *   body when its content is scrolled to the top. A drag that starts in
 *   scrolled content scrolls the content. Release decides by distance and
 *   flick velocity; dragging up past the top rubber-bands.
 * - Backdrop tap and Escape dismiss. Every dismissal except Done goes
 *   through `confirmDismiss` (unsaved changes), then `onCancel`, then
 *   `onClose`.
 * - Detents: `['medium', 'large']` opens at medium; drag (or scroll the
 *   body) up to expand. Default is large only.
 * - Only one sheet at a time: opening a sheet closes the one already open.
 * - Regular-width iPad (≥ 768 × 600) shows a centred form sheet.
 * - Focus moves into the sheet, Tab is trapped inside, and focus returns
 *   to where it was on close.
 */

export type SheetDetent = 'medium' | 'large';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  /** Leading button label; shown when set or when `onCancel` is given. */
  cancelLabel?: string;
  /** Extra hook for a dismissal without Done (Cancel, swipe, backdrop,
   *  Escape); `onClose` is called right after. */
  onCancel?: () => void;
  /** Trailing button label; shown when set or when `onDone` is given. */
  doneLabel?: string;
  /** Done tapped. Without it, Done just closes. */
  onDone?: () => void;
  doneDisabled?: boolean;
  detents?: SheetDetent[];
  /** Asked before any dismissal except Done; return false to stay open. */
  confirmDismiss?: () => Promise<boolean> | boolean;
  /** Extra class on the sheet panel. */
  className?: string;
  children?: React.ReactNode;
}

const CLOSE_ICON: IconName = 'xmark';

/** The sheet currently open (HIG: one at a time). */
let activeSheet: { close: () => void } | null = null;

const EXIT_MS = 380;

export function Sheet(props: SheetProps) {
  const { open } = props;
  const [mounted, setMounted] = React.useState(open);
  const onCloseRef = React.useRef(props.onClose);
  onCloseRef.current = props.onClose;

  React.useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    const t = window.setTimeout(() => setMounted(false), exitDelay(EXIT_MS));
    return () => window.clearTimeout(t);
  }, [open]);

  // Opening this sheet closes any other open sheet.
  React.useEffect(() => {
    if (!open) return undefined;
    const me = { close: () => onCloseRef.current() };
    if (activeSheet && activeSheet !== me) activeSheet.close();
    activeSheet = me;
    return () => {
      if (activeSheet === me) activeSheet = null;
    };
  }, [open]);

  if (!mounted) return null;
  return ReactDOM.createPortal(<SheetPanel {...props} />, document.body);
}

type Gesture =
  | { mode: 'idle' }
  | { mode: 'pending'; id: number; x0: number; y0: number; fromHeader: boolean; pointerType: string }
  | { mode: 'drag'; id: number; y0: number; offset: number }
  | { mode: 'none'; id: number };

function SheetPanel({
  open,
  onClose,
  title,
  cancelLabel,
  onCancel,
  doneLabel,
  onDone,
  doneDisabled,
  detents,
  confirmDismiss,
  className,
  children,
}: SheetProps) {
  const { t } = useTranslation();
  const titleId = React.useId();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const backdropRef = React.useRef<HTMLDivElement>(null);
  const isForm = useMediaQuery('(min-width: 768px) and (min-height: 600px)');

  const stops = React.useMemo<SheetDetent[]>(() => {
    const list = (detents?.length ? detents : (['large'] as SheetDetent[])).filter((d, i, a) => a.indexOf(d) === i);
    return isForm ? ['large'] : list;
  }, [detents, isForm]);
  const [detent, setDetent] = React.useState<SheetDetent>(stops[0]);
  React.useEffect(() => {
    if (!stops.includes(detent)) setDetent(stops[0]);
  }, [stops, detent]);

  const [shown, setShown] = React.useState(false);
  const [mediumOffset, setMediumOffset] = React.useState(0);

  // Enter (and re-open during the exit slide): paint where it is, then
  // slide up on the next frame. Closing slides it back down.
  React.useLayoutEffect(() => {
    if (!open) {
      setShown(false);
      return undefined;
    }
    panelRef.current?.getBoundingClientRect();
    const raf = window.requestAnimationFrame ?? ((cb: FrameRequestCallback) => window.setTimeout(cb, 16));
    const id = raf(() => setShown(true));
    return () => (window.cancelAnimationFrame ?? window.clearTimeout)(id);
  }, [open]);

  // Medium detent: about half the screen tall; the panel is always laid out
  // at the large height and shifted down.
  React.useLayoutEffect(() => {
    const measure = () => {
      const h = panelRef.current?.getBoundingClientRect().height ?? 0;
      setMediumOffset(Math.max(0, Math.round(h - window.innerHeight * 0.5)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const offsetFor = React.useCallback((d: SheetDetent) => (d === 'medium' ? mediumOffset : 0), [mediumOffset]);

  // ---- Dismissal -------------------------------------------------------
  const dismissing = React.useRef(false);
  const requestDismiss = React.useCallback(async () => {
    if (dismissing.current) return;
    dismissing.current = true;
    try {
      const ok = confirmDismiss ? await confirmDismiss() : true;
      if (!ok) return;
      onCancel?.();
      onClose();
    } finally {
      dismissing.current = false;
    }
  }, [confirmDismiss, onCancel, onClose]);

  // Escape (an alert or menu above handles its own Escape first).
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      void requestDismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, requestDismiss]);

  // ---- Focus -----------------------------------------------------------
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous && document.contains(previous)) previous.focus?.({ preventScroll: true });
    };
  }, []);

  // ---- Drag to dismiss / resize ----------------------------------------
  const gesture = React.useRef<Gesture>({ mode: 'idle' });
  const tracker = React.useRef(new VelocityTracker());

  const setDragStyle = (offset: number | null) => {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (!panel) return;
    if (offset === null) {
      panel.style.transform = '';
      panel.classList.remove('ios-sheet--dragging');
      if (backdrop) backdrop.style.opacity = '';
      return;
    }
    panel.classList.add('ios-sheet--dragging');
    panel.style.transform = `translate3d(0, ${offset}px, 0)`;
    if (backdrop) {
      const h = panel.getBoundingClientRect().height || window.innerHeight;
      const lowest = offsetFor(stops[0] === 'medium' ? 'medium' : detent);
      const progress = Math.min(1, Math.max(0, (offset - lowest) / Math.max(1, h - lowest)));
      backdrop.style.opacity = String(1 - progress);
    }
  };

  /** Is any scroll container between the target and the body scrolled? */
  const contentScrolled = (target: Element): boolean => {
    const body = bodyRef.current;
    for (let el: Element | null = target; el && body && body.contains(el); el = el.parentElement) {
      if ((el as HTMLElement).scrollTop > 0) return true;
      if (el === body) break;
    }
    return false;
  };

  /** Decide whether a pending gesture becomes a sheet drag. Shared by the
   *  pointer and (non-passive) touch handlers, so the first touchmove of a
   *  sheet drag can be cancelled before the browser starts scrolling. */
  const decide = (x: number, y: number) => {
    const g = gesture.current;
    if (g.mode !== 'pending') return;
    const dx = x - g.x0;
    const dy = y - g.y0;
    const slop = g.fromHeader ? 4 : 2;
    if (Math.abs(dx) < slop && Math.abs(dy) < slop) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      gesture.current = { mode: 'none', id: g.id };
      return;
    }
    const canExpand = detent === 'medium' && stops.includes('large');
    if (g.fromHeader || dy > 0 || (dy < 0 && canExpand)) {
      gesture.current = { mode: 'drag', id: g.id, y0: g.y0, offset: offsetFor(detent) };
      tracker.current.reset(offsetFor(detent));
      capturePointer(panelRef.current, g.id);
    } else {
      gesture.current = { mode: 'none', id: g.id };
    }
  };

  const move = (y: number) => {
    const g = gesture.current;
    if (g.mode !== 'drag') return;
    const h = panelRef.current?.getBoundingClientRect().height || window.innerHeight;
    let offset = offsetFor(detent) + (y - g.y0);
    if (offset < 0) offset = -rubberBand(-offset, h);
    g.offset = offset;
    tracker.current.add(offset);
    setDragStyle(offset);
  };

  const release = () => {
    const g = gesture.current;
    gesture.current = { mode: 'idle' };
    if (g.mode !== 'drag') return;
    releasePointer(panelRef.current, g.id);
    const h = panelRef.current?.getBoundingClientRect().height || window.innerHeight;
    const v = tracker.current.velocity(); // px/ms, + = down
    const projected = g.offset + v * 180;
    const positions = stops.map((d) => ({ d, y: offsetFor(d) }));
    const lowest = Math.max(...positions.map((p) => p.y));
    const moved = g.offset - offsetFor(detent);
    const dismiss = projected > lowest + Math.min(140, (h - lowest) * 0.35) || (v > 0.8 && moved > 24);
    setDragStyle(null);
    if (dismiss) {
      void requestDismiss();
      return;
    }
    const nearest = positions.reduce((best, p) => (Math.abs(p.y - projected) < Math.abs(best.y - projected) ? p : best));
    setDetent(nearest.d);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!e.isPrimary && e.pointerType !== 'mouse' && gesture.current.mode !== 'idle') return;
    suppressClick.current = false;
    const target = e.target as Element;
    const fromHeader = !!headerRef.current?.contains(target);
    const inBody = !!bodyRef.current?.contains(target);
    if (!fromHeader && !inBody) return;
    // Mouse drags in the body select text; touch drags at the top move the sheet.
    if (inBody && (e.pointerType === 'mouse' || contentScrolled(target))) {
      gesture.current = { mode: 'none', id: e.pointerId };
      return;
    }
    // Buttons in the header stay buttons for a tap; a drag still moves the sheet.
    gesture.current = { mode: 'pending', id: e.pointerId, x0: e.clientX, y0: e.clientY, fromHeader, pointerType: e.pointerType };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g.mode === 'idle' || g.mode === 'none' || g.id !== e.pointerId) return;
    decide(e.clientX, e.clientY);
    move(e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g.mode === 'idle' || g.id !== e.pointerId) return;
    release();
  };
  const onPointerCancel = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g.mode === 'idle' || g.id !== e.pointerId) return;
    gesture.current = { mode: 'idle' };
    setDragStyle(null);
  };

  // Native, non-passive touchmove: once the sheet owns the drag, stop the
  // browser from also scrolling (which would cancel the pointer stream).
  React.useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch && gesture.current.mode === 'pending') decide(touch.clientX, touch.clientY);
      if (gesture.current.mode === 'drag' && e.cancelable) e.preventDefault();
    };
    panel.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => panel.removeEventListener('touchmove', onTouchMove);
  });

  // A tap that ended a drag on the header must not also press a button.
  const suppressClick = React.useRef(false);
  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };
  const onPointerUpCapture = () => {
    if (gesture.current.mode === 'drag') suppressClick.current = true;
    else suppressClick.current = false;
  };

  // ---- Backdrop ----------------------------------------------------------
  const downOnBackdrop = React.useRef(false);

  // ---- Render ------------------------------------------------------------
  const showCancel = cancelLabel !== undefined || onCancel !== undefined;
  const showDone = doneLabel !== undefined || onDone !== undefined;
  const style = { '--ios-sheet-offset': `${offsetFor(detent)}px` } as React.CSSProperties;

  return (
    <div ref={rootRef} className={`ios-sheet-root${isForm ? ' ios-sheet-root--form' : ''}${shown ? ' ios-sheet-root--shown' : ''}`}>
      <div
        ref={backdropRef}
        className="ios-sheet__backdrop"
        aria-hidden="true"
        onPointerDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
        onClick={(e) => {
          if (downOnBackdrop.current && e.target === e.currentTarget) void requestDismiss();
          downOnBackdrop.current = false;
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`ios-sheet${isForm ? ' ios-sheet--form' : ''}${detent === 'medium' ? ' ios-sheet--medium' : ''}${className ? ` ${className}` : ''}`}
        style={style}
        onKeyDown={(e) => panelRef.current && trapTab(e, panelRef.current)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerUpCapture={onPointerUpCapture}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
      >
        <div ref={headerRef} className="ios-sheet__header">
          <div className="ios-sheet__grabber" aria-hidden="true" />
          <div className="ios-sheet__bar">
            <div className="ios-sheet__bar-leading">
              {showCancel ? (
                <button type="button" className="ios-glass-button" onClick={() => void requestDismiss()}>
                  {cancelLabel ?? t('actions.cancel')}
                </button>
              ) : (
                <button
                  type="button"
                  className="ios-glass-button ios-glass-button--icon"
                  aria-label={t('actions.close')}
                  onClick={() => void requestDismiss()}
                >
                  <Icon name={CLOSE_ICON} size={17} />
                </button>
              )}
            </div>
            {title ? (
              <h2 id={titleId} className="ios-sheet__title">{title}</h2>
            ) : (
              <span className="ios-sheet__title" />
            )}
            <div className="ios-sheet__bar-trailing">
              {showDone && (
                <button
                  type="button"
                  className="ios-glass-button ios-glass-button--prominent"
                  disabled={doneDisabled}
                  onClick={() => (onDone ? onDone() : onClose())}
                >
                  {doneLabel ?? t('actions.done')}
                </button>
              )}
            </div>
          </div>
        </div>
        <div
          ref={bodyRef}
          className="ios-sheet__body"
          onFocus={(e) => {
            // At the medium detent the lower part of the body is off-screen;
            // keyboard / VoiceOver focus landing there expands the sheet.
            if (detent === 'medium' && stops.includes('large') && e.target.getBoundingClientRect().bottom > window.innerHeight) {
              setDetent('large');
            }
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
