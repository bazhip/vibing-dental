import React from 'react';

/**
 * Backdrop-click dismissal for modal overlays. Closes only when the
 * press both starts AND ends on the backdrop itself — drag-selecting text
 * in a field and releasing over the backdrop must not close the dialog
 * (and lose what was typed). Spread the result onto the overlay element.
 */
export function useBackdropDismiss(onDismiss: () => void) {
  const downOnBackdrop = React.useRef(false);
  return {
    onMouseDown: (e: React.MouseEvent) => {
      downOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      const fromBackdrop = downOnBackdrop.current && e.target === e.currentTarget;
      downOnBackdrop.current = false;
      if (fromBackdrop) onDismiss();
    },
  };
}
