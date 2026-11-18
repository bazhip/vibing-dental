import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { normalizeSnapshot, useChartState } from './useChartState';
import { VISIT_DOCUMENT_FIELDS } from '../utils/visitDocumentation';
const sources = { consultationHistory: 'History?', consultationAssessment: 'Uncertain', consultationPlan: 'Discuss options', dischargeMedications: 'Drug 2 mg? confirm', dischargeInstructions: 'Recorded wording', dischargeFollowUp: 'As discussed' };
const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
});
afterEach(() => vi.unstubAllGlobals());
it('round-trips all entered sources through local storage and snapshot load, then clears them on a new visit', () => {
  const first = renderHook(() => useChartState());
  act(() => first.result.current.setPatientInfo(p => ({ ...p, patientName: 'Milo', ...sources })));
  first.unmount();
  const next = renderHook(() => useChartState());
  expect(next.result.current.patientInfo).toMatchObject(sources);
  const snapshot = JSON.parse(JSON.stringify(next.result.current.getSnapshot()));
  act(() => next.result.current.applySnapshot(snapshot, 'saved-visit'));
  expect(next.result.current.patientInfo).toMatchObject(sources);
  act(() => next.result.current.startNewVisit());
  expect(next.result.current.patientInfo.patientName).toBe('Milo');
  for (const key of VISIT_DOCUMENT_FIELDS) expect(next.result.current.patientInfo).not.toHaveProperty(key);
});
it('normalizes malformed imported fields without adding fields to an old chart', () => {
  const { result } = renderHook(() => useChartState());
  const snapshot = result.current.getSnapshot();
  expect(normalizeSnapshot(snapshot).patientInfo).not.toHaveProperty('consultationHistory');
  const bad = { ...snapshot, patientInfo: { ...snapshot.patientInfo, consultationHistory: {}, dischargeMedications: 'x'.repeat(20001) } };
  const info = normalizeSnapshot(bad as never).patientInfo;
  expect(info).not.toHaveProperty('consultationHistory');
  expect(info).not.toHaveProperty('dischargeMedications');
});
