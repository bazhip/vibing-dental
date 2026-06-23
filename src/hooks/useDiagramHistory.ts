import React from 'react';
import { ToothMarks, DiagramComment, DiagramStroke } from '../types';

/**
 * Snapshot-based undo/redo for a single diagram (marks + comments + strokes
 * are tracked together — one undo reverses whatever the user did last
 * regardless of which tool produced it).
 *
 * Implementation:
 *   - The hook observes the three state values via a `useEffect`. When
 *     they change for any reason other than our own undo/redo, the prior
 *     snapshot is pushed onto the past stack (and the future stack is
 *     cleared, since the user just diverged from the redo timeline).
 *   - `undo()`/`redo()` set a guard ref before calling the change
 *     handlers so the resulting effect knows to skip pushing.
 *   - Each diagram has its own history. `Cmd/Ctrl+Z` is dispatched to
 *     whichever diagram the user most recently interacted with — caller
 *     calls `claim()` on every user action it surfaces (a click in the
 *     toolbar, a mouse-down on the diagram, etc.).
 */

interface Snapshot {
  marks: ToothMarks;
  comments: DiagramComment[];
  strokes: DiagramStroke[];
}

interface DiagramSetters {
  onMarks: (m: ToothMarks) => void;
  onComments: (c: DiagramComment[]) => void;
  onStrokes: (s: DiagramStroke[]) => void;
}

export interface DiagramHistoryControls {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Mark this diagram as the keyboard-shortcut target. Caller invokes
   *  this on any user interaction in the diagram view. */
  claim: () => void;
}

const HISTORY_LIMIT = 50;

/** Module-level: which diagram id was most recently interacted with.
 *  Cmd+Z routes to that one. Reset to null when the last hook unmounts
 *  (we don't bother — stale value is harmless until another hook claims). */
let mostRecentDiagramId: string | null = null;

export function useDiagramHistory(
  diagramId: string,
  marks: ToothMarks,
  comments: DiagramComment[],
  strokes: DiagramStroke[],
  setters: DiagramSetters
): DiagramHistoryControls {
  const [past, setPast] = React.useState<Snapshot[]>([]);
  const [future, setFuture] = React.useState<Snapshot[]>([]);
  const prevRef = React.useRef<Snapshot>({ marks, comments, strokes });

  // Track external state changes and push prior state to history.
  //
  // We don't use a boolean "are we applying an undo" flag: undo/redo fire
  // three separate setters, and a single boolean is consumed by whichever
  // effect pass runs first, mis-recording the rest as user edits. Instead,
  // undo/redo set `prevRef` to the exact snapshot they're restoring (and
  // pass those same references to the setters), so this observer sees
  // `prev === current` for all three and skips re-recording naturally.
  React.useEffect(() => {
    const prev = prevRef.current;
    if (prev.marks === marks && prev.comments === comments && prev.strokes === strokes) {
      return;
    }
    setPast((p) => [...p, prev].slice(-HISTORY_LIMIT));
    setFuture([]);
    prevRef.current = { marks, comments, strokes };
  }, [marks, comments, strokes]);

  const undo = React.useCallback(() => {
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    setFuture((f) => [{ marks, comments, strokes }, ...f].slice(0, HISTORY_LIMIT));
    setPast((p) => p.slice(0, -1));
    prevRef.current = prev;
    setters.onMarks(prev.marks);
    setters.onComments(prev.comments);
    setters.onStrokes(prev.strokes);
  }, [past, marks, comments, strokes, setters]);

  const redo = React.useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setPast((p) => [...p, { marks, comments, strokes }].slice(-HISTORY_LIMIT));
    setFuture((f) => f.slice(1));
    prevRef.current = next;
    setters.onMarks(next.marks);
    setters.onComments(next.comments);
    setters.onStrokes(next.strokes);
  }, [future, marks, comments, strokes, setters]);

  const claim = React.useCallback(() => {
    mostRecentDiagramId = diagramId;
  }, [diagramId]);

  // Release the keyboard-shortcut claim on unmount so Cmd+Z doesn't point
  // at a diagram that's no longer mounted.
  React.useEffect(() => {
    return () => {
      if (mostRecentDiagramId === diagramId) mostRecentDiagramId = null;
    };
  }, [diagramId]);

  // Keyboard shortcuts — only the most-recently-claimed diagram responds.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (mostRecentDiagramId !== diagramId) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== 'z') return;
      // Don't intercept the browser's text-edit undo inside form fields.
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [diagramId, undo, redo]);

  return {
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    claim,
  };
}
