import React from 'react';

/**
 * Small helpers shared by the kit's touch gestures (sheet drag, edge
 * back-swipe, swipe actions, long-press).
 */

/** True when the user asked for Reduce Motion (or matchMedia is missing). */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Duration (ms) to wait for an exit transition before unmounting. */
export function exitDelay(ms: number): number {
  return prefersReducedMotion() ? 0 : ms;
}

/**
 * UIScrollView-style rubber banding: the further past the edge, the less
 * the content follows the finger. `dimension` is the size of the view.
 */
export function rubberBand(overshoot: number, dimension: number, constant = 0.55): number {
  if (overshoot <= 0) return 0;
  const d = Math.max(1, dimension);
  return (1 - 1 / ((overshoot * constant) / d + 1)) * d;
}

/** Tracks recent positions along one axis to estimate release velocity. */
export class VelocityTracker {
  private samples: { t: number; v: number }[] = [];

  reset(value: number): void {
    this.samples = [{ t: performance.now(), v: value }];
  }

  add(value: number): void {
    const t = performance.now();
    this.samples.push({ t, v: value });
    // Keep the last ~100ms (and never fewer than two samples).
    while (this.samples.length > 2 && t - this.samples[0].t > 100) this.samples.shift();
  }

  /** px per ms; positive when the value grew. 0 if there is no time span. */
  velocity(): number {
    if (this.samples.length < 2) return 0;
    const a = this.samples[0];
    const b = this.samples[this.samples.length - 1];
    const dt = b.t - a.t;
    if (dt < 1) return 0;
    return (b.v - a.v) / dt;
  }
}

/** setPointerCapture that tolerates environments without it (jsdom) and
 *  pointers that are already gone. */
export function capturePointer(el: Element | null, pointerId: number): void {
  try {
    (el as HTMLElement | null)?.setPointerCapture?.(pointerId);
  } catch {
    /* pointer already released */
  }
}

export function releasePointer(el: Element | null, pointerId: number): void {
  try {
    if ((el as HTMLElement | null)?.hasPointerCapture?.(pointerId)) (el as HTMLElement).releasePointerCapture(pointerId);
  } catch {
    /* pointer already released */
  }
}

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Tabbable elements inside `root`, in DOM order. */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest('[inert], [aria-hidden="true"]') && el.tabIndex !== -1
  );
}

/** Keep Tab / Shift+Tab inside `root`. Call from a keydown handler. */
export function trapTab(e: KeyboardEvent | React.KeyboardEvent, root: HTMLElement): void {
  if (e.key !== 'Tab') return;
  const items = focusableIn(root);
  if (items.length === 0) {
    e.preventDefault();
    root.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey && (active === first || active === root || !root.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !root.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

/** Live result of a media query (false where matchMedia is missing). */
export function useMediaQuery(query: string): boolean {
  const get = () => {
    try {
      return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
    } catch {
      return false;
    }
  };
  const [matches, setMatches] = React.useState(get);
  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [query]);
  return matches;
}
