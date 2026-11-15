import { act, renderHook } from '@testing-library/react';
import { useChartState } from './useChartState';
import type { StoredRecordNote } from '../types';

const note: StoredRecordNote = { text: 'x', source: 'edited', lng: 'en', basedOn: '1' };

describe('useChartState record note', () => {

  it('setRecordNote appears in getSnapshot', () => {
    const { result } = renderHook(() => useChartState());
    act(() => result.current.setRecordNote(note));
    expect(result.current.recordNote).toEqual(note);
    expect(result.current.getSnapshot().recordNote?.text).toBe('x');
  });

  it('null clears it and leaves no key in the snapshot', () => {
    const { result } = renderHook(() => useChartState());
    act(() => result.current.setRecordNote(note));
    act(() => result.current.setRecordNote(null));
    expect(result.current.recordNote).toBeNull();
    expect('recordNote' in result.current.getSnapshot()).toBe(false);
  });

  it('applySnapshot restores it', () => {
    const { result } = renderHook(() => useChartState());
    const snap = { ...result.current.getSnapshot(), recordNote: { ...note, source: 'ai' as const } };
    act(() => result.current.applySnapshot(snap, 'c1'));
    expect(result.current.recordNote).toEqual({ ...note, source: 'ai' });
  });

  it('applySnapshot without it clears it', () => {
    const { result } = renderHook(() => useChartState());
    act(() => result.current.setRecordNote(note));
    const { recordNote: _drop, ...snap } = result.current.getSnapshot();
    act(() => result.current.applySnapshot(snap, 'c2'));
    expect(result.current.recordNote).toBeNull();
  });
});
