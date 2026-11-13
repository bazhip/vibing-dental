/**
 * Apple Pencil palm rejection for the drawing tool.
 *
 * Finger drawing works until a pen is seen; from then on, touch input is
 * ignored for the rest of the session so a resting palm can't add strokes.
 * Mouse (and any other pointer type) is always accepted.
 */
export interface PenFilter {
  accept(pointerType: string): boolean;
}

export function createPenFilter(): PenFilter {
  let penSeen = false;
  return {
    accept(pointerType: string): boolean {
      if (pointerType === 'pen') {
        penSeen = true;
        return true;
      }
      if (pointerType === 'touch') return !penSeen;
      return true;
    },
  };
}
