import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { normalizeSnapshot, useChartState } from './useChartState';
import { hasClinicalContent } from './useCloudSync';

const answer = {
  page: 'exam' as const,
  field: {
    id: '3b71a1c4-dc76-4b3c-9edd-b441b727ef02',
    label: 'Palpation',
    inputType: 'dropdown' as const,
    options: ['Reviewed', 'Pending'],
  },
  value: 'Reviewed',
};

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
});

afterEach(() => vi.unstubAllGlobals());

it('restores practice answers from the local working copy after reload', () => {
  const editor = renderHook(useChartState);
  act(() => editor.result.current.setPatientInfo(previous => ({ ...previous, practiceChartFields: [answer] })));
  editor.unmount();
  const reopened = renderHook(useChartState);
  expect(reopened.result.current.patientInfo.practiceChartFields).toEqual([answer]);
});

it('restores recorded answers from the visit snapshot and clears them on a new visit', () => {
  const { result } = renderHook(useChartState);
  const original = result.current.getSnapshot();
  act(() => result.current.setPatientInfo(previous => ({ ...previous, patientName: 'Milo', practiceChartFields: [answer] })));
  const stored = JSON.parse(JSON.stringify(result.current.getSnapshot()));
  act(() => result.current.startNewVisit());
  expect(result.current.patientInfo).not.toHaveProperty('practiceChartFields');
  expect(result.current.patientInfo.patientName).toBe('Milo');
  act(() => result.current.applySnapshot(stored, 'stored-visit'));
  expect(result.current.patientInfo.practiceChartFields).toEqual([answer]);
  act(() => result.current.applySnapshot(original, 'old-visit'));
  expect(result.current.patientInfo).not.toHaveProperty('practiceChartFields');
});

it('ignores malformed recorded answers in imported snapshots', () => {
  const { result } = renderHook(useChartState);
  const snapshot = result.current.getSnapshot();
  const malformed = { ...snapshot, patientInfo: { ...snapshot.patientInfo, practiceChartFields: [
    { ...answer, page: 'unknown' },
    { ...answer, field: { ...answer.field, id: '__proto__' } },
    { ...answer, value: { unexpected: true } },
    answer,
  ] } };
  expect(normalizeSnapshot(malformed as never).patientInfo.practiceChartFields).toEqual([answer]);
});

it('counts a recorded practice answer as clinical content', () => {
  const { result } = renderHook(useChartState);
  const snapshot = result.current.getSnapshot();
  expect(hasClinicalContent({ ...snapshot, patientInfo: { ...snapshot.patientInfo, practiceChartFields: [answer] } })).toBe(true);
  expect(hasClinicalContent({ ...snapshot, patientInfo: { ...snapshot.patientInfo, practiceChartFields: [{ ...answer, value: ' ' }] } })).toBe(false);
});
