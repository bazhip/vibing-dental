import React from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open dialogs holding the page still (dialogs can stack). */
let scrollLocks = 0;
let lockedScrollY = 0;

/** Keep the page behind an open dialog from scrolling. iOS Safari
 *  ignores `overflow: hidden` on the body for touch scrolling, so the
 *  body is pinned in place (position: fixed at the current offset) and
 *  put back where it was when the last dialog closes. */
function lockPageScroll(): () => void {
  if (scrollLocks++ === 0) {
    lockedScrollY = window.scrollY;
    const s = document.body.style;
    s.position = 'fixed';
    s.top = `-${lockedScrollY}px`;
    s.left = '0';
    s.right = '0';
    s.overflow = 'hidden';
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--scrollLocks === 0) {
      const s = document.body.style;
      s.position = s.top = s.left = s.right = s.overflow = '';
      if (lockedScrollY > 0) window.scrollTo(0, lockedScrollY);
    }
  };
}

/**
 * Dialog focus management for the shared modal pattern: while `open`,
 * Tab cycles inside the container (never escapes to the page behind the
 * overlay), initial focus moves into the dialog, and when it closes,
 * focus returns to whatever opened it. Attach the returned ref to the
 * modal's content element (the `.ai-settings-modal` div).
 */
export function useModalFocus<T extends HTMLElement = HTMLDivElement>(
  open: boolean
): React.RefObject<T | null> {
  const containerRef = React.useRef<T>(null);

  React.useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;

    // Move focus into the dialog unless something inside it (an
    // autoFocus field) already claimed it.
    const container = containerRef.current;
    if (container && !container.contains(document.activeElement)) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? container).focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const el = containerRef.current;
      if (!el) return;
      const focusables = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      // Focus escaped the dialog (or sits on its edge): wrap.
      if (!el.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const unlockScroll = lockPageScroll();
    return () => {
      unlockScroll();
      document.removeEventListener('keydown', onKeyDown, true);
      // Restore focus to the opener so keyboard users don't land back at
      // the top of the document.
      opener?.focus?.();
    };
  }, [open]);

  return containerRef;
}
