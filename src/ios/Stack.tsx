import React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from './icons';
import { NavBar } from './NavBar';
import { capturePointer, exitDelay, releasePointer, VelocityTracker } from './gesture';

/**
 * iOS navigation stack (UINavigationController).
 *
 * `root` is the first screen (it brings its own NavBar). `push()` slides a
 * screen in from the trailing edge with a NavBar whose Back button is
 * labelled with the previous screen's title; `pop()` slides it out. A
 * swipe from the leading edge pops interactively, following the finger,
 * and settles by distance and velocity.
 *
 * Every screen stays mounted while it is in the stack, so scroll position
 * and form state survive a push/pop; screens under the top one are inert
 * and hidden from assistive tech.
 */

export interface StackScreen {
  id: string;
  title: string;
  render(): React.ReactNode;
  trailing?: React.ReactNode;
}

export interface StackApi {
  push(screen: StackScreen): void;
  pop(): void;
  /** Pushed screens above the root (0 at the root). */
  depth: number;
}

const StackContext = React.createContext<StackApi | null>(null);

export function useStack(): StackApi {
  const api = React.useContext(StackContext);
  if (!api) throw new Error('useStack() must be used inside <Stack>');
  return api;
}

interface Entry {
  key: number;
  screen: StackScreen;
  phase: 'enter' | 'idle' | 'exit';
}

const BACK_ICON: IconName = 'chevron-left';
const TRANSITION_MS = 350;
/** Touches that start this close to the leading edge can swipe back. */
const EDGE_WIDTH = 24;

export interface StackProps {
  root: React.ReactNode;
  /** The root screen's title, for the first Back button. */
  rootTitle?: string;
}

export function Stack({ root, rootTitle }: StackProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const nextKey = React.useRef(1);
  const live = entries.filter((e) => e.phase !== 'exit');
  const depth = live.length;

  const push = React.useCallback((screen: StackScreen) => {
    const key = nextKey.current++;
    setEntries((list) => [...list, { key, screen, phase: 'enter' }]);
  }, []);

  const pop = React.useCallback(() => {
    setEntries((list) => {
      const i = list.reduce((last, e, idx) => (e.phase !== 'exit' ? idx : last), -1);
      if (i < 0) return list;
      return list.map((e, idx) => (idx === i ? { ...e, phase: 'exit' } : e));
    });
  }, []);

  // Screens on their way out unmount once the slide has finished.
  React.useEffect(() => {
    if (!entries.some((e) => e.phase === 'exit')) return undefined;
    const t = window.setTimeout(() => setEntries((list) => list.filter((e) => e.phase !== 'exit')), exitDelay(TRANSITION_MS));
    return () => window.clearTimeout(t);
  }, [entries]);

  // Entering screens: paint off-screen, then slide in on the next frame.
  React.useEffect(() => {
    if (!entries.some((e) => e.phase === 'enter')) return undefined;
    const raf = window.requestAnimationFrame ?? ((cb: FrameRequestCallback) => window.setTimeout(cb, 16));
    const id = raf(() => setEntries((list) => list.map((e) => (e.phase === 'enter' ? { ...e, phase: 'idle' } : e))));
    return () => (window.cancelAnimationFrame ?? window.clearTimeout)(id);
  }, [entries]);

  const api = React.useMemo<StackApi>(() => ({ push, pop, depth }), [push, pop, depth]);

  // ---- Edge back-swipe ---------------------------------------------------
  const layerRefs = React.useRef(new Map<number, HTMLDivElement>());
  const swipe = React.useRef<
    | { mode: 'pending' | 'drag'; id: number; x0: number; y0: number; dx: number; width: number; top: number; under: number }
    | null
  >(null);
  const tracker = React.useRef(new VelocityTracker());

  const topKey = live.length ? live[live.length - 1].key : 0;
  const underKey = live.length > 1 ? live[live.length - 2].key : 0; // 0 = root

  const styleDrag = (dx: number | null, width: number) => {
    const top = layerRefs.current.get(topKey);
    const under = layerRefs.current.get(underKey);
    for (const el of [top, under]) {
      if (!el) continue;
      el.classList.toggle('ios-stack__layer--dragging', dx !== null);
    }
    if (dx === null) {
      if (top) top.style.transform = '';
      if (under) {
        under.style.transform = '';
        under.style.removeProperty('--ios-stack-dim');
      }
      return;
    }
    const p = Math.min(1, Math.max(0, dx / width));
    if (top) top.style.transform = `translate3d(${dx}px, 0, 0)`;
    if (under) {
      under.style.transform = `translate3d(${-30 * (1 - p)}%, 0, 0)`;
      under.style.setProperty('--ios-stack-dim', String(1 - p));
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (depth === 0 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left > EDGE_WIDTH) return;
    swipe.current = {
      mode: 'pending',
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      dx: 0,
      width: rect.width || window.innerWidth,
      top: topKey,
      under: underKey,
    };
  };
  const decide = (x: number, y: number) => {
    const s = swipe.current;
    if (!s || s.mode !== 'pending') return;
    const dx = x - s.x0;
    const dy = y - s.y0;
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    if (dx > 0 && Math.abs(dx) > Math.abs(dy)) {
      s.mode = 'drag';
      s.x0 = x - dx; // follow the finger from where it touched down
      tracker.current.reset(0);
      capturePointer(layerRefs.current.get(s.top) ?? null, s.id);
    } else {
      swipe.current = null;
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    decide(e.clientX, e.clientY);
    if (swipe.current?.mode !== 'drag') return;
    s.dx = Math.max(0, e.clientX - s.x0);
    tracker.current.add(s.dx);
    styleDrag(s.dx, s.width);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    swipe.current = null;
    if (s.mode !== 'drag') return;
    releasePointer(layerRefs.current.get(s.top) ?? null, s.id);
    const v = tracker.current.velocity();
    const shouldPop = s.dx + v * 150 > s.width * 0.5 || (v > 0.35 && s.dx > 30);
    styleDrag(null, s.width);
    if (shouldPop) pop();
  };
  const onPointerCancel = (e: React.PointerEvent) => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    swipe.current = null;
    styleDrag(null, s.width);
  };
  const touchHandlerRef = React.useRef<(e: TouchEvent) => void>(() => {});
  touchHandlerRef.current = (e: TouchEvent) => {
    const touch = e.touches[0];
    if (touch && swipe.current?.mode === 'pending') decide(touch.clientX, touch.clientY);
    if (swipe.current?.mode === 'drag' && e.cancelable) e.preventDefault();
  };
  const containerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const handler = (e: TouchEvent) => touchHandlerRef.current(e);
    el.addEventListener('touchmove', handler, { passive: false });
    return () => el.removeEventListener('touchmove', handler);
  }, []);

  // ---- Render --------------------------------------------------------------
  const setLayerRef = (key: number) => (el: HTMLDivElement | null) => {
    if (el) layerRefs.current.set(key, el);
    else layerRefs.current.delete(key);
  };

  const layerClass = (key: number, phase: Entry['phase'] | 'root') => {
    const classes = ['ios-stack__layer'];
    if (phase === 'enter') classes.push('ios-stack__layer--enter');
    if (phase === 'exit') classes.push('ios-stack__layer--exit');
    if (key !== topKey) {
      // Directly under the top (and not on its way out): shifted left, dimmed.
      if (key === underKey) classes.push('ios-stack__layer--under');
      else if (phase !== 'exit') classes.push('ios-stack__layer--buried');
    }
    return classes.join(' ');
  };

  return (
    <StackContext.Provider value={api}>
      <div
        ref={containerRef}
        className="ios-stack"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div
          ref={setLayerRef(0)}
          className={layerClass(0, 'root')}
          aria-hidden={topKey !== 0 ? true : undefined}
          inert={topKey !== 0 ? true : undefined}
        >
          {root}
        </div>
        {entries.map((entry) => {
          const index = live.indexOf(entry);
          const prevTitle = index > 0 ? live[index - 1].screen.title : rootTitle;
          const isTop = entry.key === topKey;
          return (
            <PushedLayer
              key={entry.key}
              layerRef={setLayerRef(entry.key)}
              className={layerClass(entry.key, entry.phase)}
              hidden={!isTop}
              screen={entry.screen}
              backLabel={prevTitle || t('ios.back')}
              onBack={pop}
            />
          );
        })}
      </div>
    </StackContext.Provider>
  );
}

function PushedLayer({
  layerRef,
  className,
  hidden,
  screen,
  backLabel,
  onBack,
}: {
  layerRef: (el: HTMLDivElement | null) => void;
  className: string;
  hidden: boolean;
  screen: StackScreen;
  backLabel: string;
  onBack: () => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const setRefs = React.useCallback(
    (el: HTMLDivElement | null) => {
      scrollRef.current = el;
      layerRef(el);
    },
    // layerRef is recreated each render but always maps to the same key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  return (
    <div
      ref={setRefs}
      className={`${className} ios-stack__layer--pushed`}
      aria-hidden={hidden ? true : undefined}
      inert={hidden ? true : undefined}
    >
      <NavBar
        title={screen.title}
        scrollRef={scrollRef}
        leading={
          <button type="button" className="ios-back-button" onClick={onBack}>
            <Icon name={BACK_ICON} size={22} />
            <span className="ios-back-button__label">{backLabel}</span>
          </button>
        }
        trailing={screen.trailing}
      />
      <div className="ios-stack__content">{screen.render()}</div>
    </div>
  );
}
