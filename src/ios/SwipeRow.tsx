import React from 'react';
import { useTranslation } from 'react-i18next';
import { hapticImpact } from '../native/haptics';
import { Icon, type IconName } from './icons';
import { RowWrapperContext } from './List';
import { capturePointer, releasePointer, VelocityTracker } from './gesture';

/**
 * A list row with trailing swipe actions (UITableView-style).
 *
 * Swipe left to reveal the actions; release past half of them (or with a
 * flick) to keep them open. A full swipe performs the first action, which
 * is drawn outermost, like Mail's delete. A tap outside, a tap on the row,
 * or Escape closes it; only one row is open at a time.
 *
 * Accessible alternative: a "More actions" button after the row (visually
 * hidden until it has keyboard focus) toggles the same actions, so they
 * are reachable with a keyboard, Switch Control and VoiceOver.
 */

export interface SwipeAction {
  label: string;
  icon?: IconName;
  tone?: 'default' | 'destructive' | 'tint';
  onAction(): void;
}

export interface SwipeRowProps {
  actions: SwipeAction[];
  children: React.ReactNode;
}

const ACTION_WIDTH = 74;
const MORE_ICON: IconName = 'ellipsis-circle';

/** The open row, so opening another closes it. */
let openRow: { close: () => void } | null = null;

type Drag =
  | { mode: 'pending'; id: number; x0: number; y0: number; start: number }
  | { mode: 'drag'; id: number; x0: number; start: number; offset: number; width: number };

export function SwipeRow({ actions, children }: SwipeRowProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [revealed, setRevealed] = React.useState(false);
  const [full, setFull] = React.useState(false);
  const rowRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const actionsRef = React.useRef<HTMLDivElement>(null);
  const moreRef = React.useRef<HTMLButtonElement>(null);
  const drag = React.useRef<Drag | null>(null);
  const tracker = React.useRef(new VelocityTracker());
  const suppressClick = React.useRef(false);
  const total = actions.length * ACTION_WIDTH;

  const close = React.useCallback(() => {
    setOpen(false);
    setFull(false);
  }, []);
  const me = React.useRef({ close });
  me.current.close = close;

  React.useEffect(() => {
    if (!open) {
      // Hide the buttons once the row has slid shut.
      const tm = window.setTimeout(() => setRevealed(false), 300);
      if (openRow === me.current) openRow = null;
      return () => window.clearTimeout(tm);
    }
    if (openRow && openRow !== me.current) openRow.close();
    openRow = me.current;
    setRevealed(true);
    const onDown = (e: PointerEvent) => {
      if (!rowRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, close]);

  // Buttons stay mounted while the row slides shut (hidden from AT).
  const showActions = open || revealed;

  const paint = (offset: number | null) => {
    const content = contentRef.current;
    const box = actionsRef.current;
    if (!content) return;
    content.classList.toggle('ios-swiperow__content--dragging', offset !== null);
    box?.classList.toggle('ios-swiperow__actions--dragging', offset !== null);
    content.style.transform = offset === null ? '' : `translate3d(${offset}px, 0, 0)`;
    if (box) box.style.width = offset === null ? '' : `${Math.max(0, -offset)}px`;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    suppressClick.current = false;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { mode: 'pending', id: e.pointerId, x0: e.clientX, y0: e.clientY, start: open ? -total : 0 };
  };

  const decide = (x: number, y: number) => {
    const d = drag.current;
    if (!d || d.mode !== 'pending') return;
    const dx = x - d.x0;
    const dy = y - d.y0;
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    if (Math.abs(dx) <= Math.abs(dy) || (dx > 0 && d.start === 0)) {
      drag.current = null;
      return;
    }
    const width = rowRef.current?.getBoundingClientRect().width || 375;
    drag.current = { mode: 'drag', id: d.id, x0: d.x0, start: d.start, offset: d.start, width };
    tracker.current.reset(d.start);
    setRevealed(true);
    capturePointer(contentRef.current, d.id);
  };

  const fullThreshold = (width: number) => Math.max(total + 60, width * 0.55);

  const onPointerMove = (e: React.PointerEvent) => {
    const d0 = drag.current;
    if (!d0 || d0.id !== e.pointerId) return;
    decide(e.clientX, e.clientY);
    const d = drag.current;
    if (!d || d.mode !== 'drag') return;
    let offset = d.start + (e.clientX - d.x0);
    if (offset > 0) offset = offset * 0.2; // resist opening the other way
    d.offset = offset;
    tracker.current.add(offset);
    const isFull = -offset > fullThreshold(d.width);
    if (isFull !== full) {
      if (isFull) hapticImpact();
      setFull(isFull);
    }
    paint(offset);
  };

  const finish = (e: React.PointerEvent, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.mode !== 'drag') return;
    suppressClick.current = true;
    releasePointer(contentRef.current, d.id);
    paint(null);
    if (cancelled) {
      setFull(false);
      return;
    }
    const v = tracker.current.velocity(); // px/ms, negative = leftwards
    if (-d.offset > fullThreshold(d.width) && actions[0]) {
      close();
      actions[0].onAction();
      return;
    }
    setFull(false);
    const opened = -d.offset + -v * 120 > total / 2;
    setOpen(opened);
  };

  // Stop the browser scrolling sideways once the row owns the drag.
  React.useEffect(() => {
    const el = contentRef.current;
    if (!el) return undefined;
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch && drag.current?.mode === 'pending') decide(touch.clientX, touch.clientY);
      if (drag.current?.mode === 'drag' && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  });

  const run = (action: SwipeAction) => {
    close();
    action.onAction();
  };

  return (
    <div
      ref={rowRef}
      role="listitem"
      className={`ios-swiperow${open ? ' ios-swiperow--open' : ''}${full ? ' ios-swiperow--full' : ''}`}
      style={{ '--ios-swipe-total': `${total}px` } as React.CSSProperties}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          close();
          moreRef.current?.focus();
        }
      }}
    >
      <div
        ref={contentRef}
        className="ios-swiperow__content"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onClickCapture={(e) => {
          if (suppressClick.current || open) {
            suppressClick.current = false;
            e.preventDefault();
            e.stopPropagation();
            if (open) close();
          }
        }}
      >
        <RowWrapperContext.Provider value>{children}</RowWrapperContext.Provider>
      </div>
      <button
        ref={moreRef}
        type="button"
        className="ios-swiperow__more"
        aria-label={t('ios.moreActions')}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon name={MORE_ICON} size={20} />
      </button>
      <div ref={actionsRef} className="ios-swiperow__actions" aria-hidden={open ? undefined : true}>
        {showActions &&
          actions.map((action, i) => (
            <button
              key={`${action.label}-${i}`}
              type="button"
              tabIndex={open ? undefined : -1}
              className={`ios-swiperow__action ios-swiperow__action--${action.tone ?? 'default'}${i === 0 ? ' ios-swiperow__action--first' : ''}`}
              onClick={() => run(action)}
            >
              {action.icon && <Icon name={action.icon} size={20} />}
              <span className="ios-swiperow__action-label">{action.label}</span>
            </button>
          ))}
      </div>
    </div>
  );
}
