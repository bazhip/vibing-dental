import { renderHook, act } from '@testing-library/react';
import { useDiagramHistory } from './useDiagramHistory';
import type { DiagramComment } from '../types';

describe('useDiagramHistory — automatic fit-to-text', () => {
  it('does not record a size fill-in as its own undo step', () => {
    const marks = {};
    const strokes: never[] = [];
    const onComments = vi.fn();
    const setters = { onMarks: vi.fn(), onComments, onStrokes: vi.fn() };
    let comments: DiagramComment[] = [];
    const { result, rerender } = renderHook(() =>
      useDiagramHistory('pre', marks, comments, strokes, setters)
    );

    // AI adds a note (unsized) — an undoable edit.
    const note: DiagramComment = { id: 'ai1', text: 'T/FX/CCF', anchorTriadan: 104 };
    comments = [note];
    rerender();
    expect(result.current.canUndo).toBe(true);

    // Diagram fits it to its text — layout only.
    comments = [{ ...note, width: 120, height: 60 }];
    rerender();

    // One undo removes the note entirely.
    act(() => result.current.undo());
    expect(onComments).toHaveBeenLastCalledWith([]);
  });
});
