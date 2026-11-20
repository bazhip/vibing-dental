import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { normalizeSnapshot, useChartState } from './useChartState';
import { ownerReportPhotoRoles } from '../utils/ownerReport';
import { VISIT_DOCUMENT_FIELDS } from '../utils/visitDocumentation';
const sources = { gpVitals: '4 kg?', gpPhysicalExam: 'Left ear sore', gpDiagnostics: 'CBC pending', consultationHistory: 'History?', consultationAssessment: 'Uncertain', consultationPlan: 'Discuss options', dischargeMedications: 'Drug 2 mg? confirm', dischargeInstructions: 'Recorded wording', dischargeFollowUp: 'As discussed' };
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
  expect(normalizeSnapshot(snapshot)).not.toHaveProperty('clinicalDictations');
  const bad = { ...snapshot, patientInfo: { ...snapshot.patientInfo, consultationHistory: {}, dischargeMedications: 'x'.repeat(20001) } };
  const info = normalizeSnapshot(bad as never).patientInfo;
  expect(info).not.toHaveProperty('consultationHistory');
  expect(info).not.toHaveProperty('dischargeMedications');
});

it('persists clinical provenance separately, normalizes imports, and clears it for another visit', () => {
  const source = { id: 'test', kind: 'gp-exam' as const, language: 'en' as const, transcript: 'Weight 4 kg?', recordedAt: '2026-11-18T12:00:00Z', fields: ['gpVitals' as const] };
  const first = renderHook(() => useChartState());
  act(() => first.result.current.appendClinicalDictation(source));
  const snapshot = first.result.current.getSnapshot();
  expect(snapshot.clinicalDictations).toEqual([source]);
  first.unmount();
  const next = renderHook(() => useChartState());
  expect(next.result.current.getSnapshot().clinicalDictations).toEqual([source]);
  act(() => next.result.current.applySnapshot({ ...snapshot, clinicalDictations: [source, {}] } as never, 'cloud'));
  expect(next.result.current.clinicalDictations).toEqual([source]);
  act(() => next.result.current.startNewVisit());
  expect(next.result.current.getSnapshot().clinicalDictations).toBeUndefined();
});

it('appends multiple sources in a batch and rejects a duplicate synchronously without changing provenance', () => {
  const { result } = renderHook(() => useChartState());
  const source = { id: 'one', kind: 'ct' as const, language: 'en' as const, transcript: 'Uncertain extent', recordedAt: '2026-11-18T12:00:00Z', fields: ['ctReport' as const] };
  act(() => {
    result.current.appendClinicalDictation(source);
    result.current.appendClinicalDictation({ ...source, id: 'two' });
  });
  expect(result.current.clinicalDictations).toHaveLength(2);
  expect(() => result.current.appendClinicalDictation(source)).toThrow();
  expect(result.current.clinicalDictations).toHaveLength(2);
});
it('keeps a same-batch source append bound to the reset or loaded visit', () => {
  const { result } = renderHook(() => useChartState());
  const source = { id: 'old', kind: 'gp-visit' as const, language: 'en' as const, transcript: 'Recorded observation.', recordedAt: '2026-11-18T12:00:00Z', fields: ['gpPhysicalExam' as const] };
  act(() => result.current.appendClinicalDictation(source));
  act(() => { result.current.startNewVisit(); result.current.appendClinicalDictation({ ...source, id: 'new' }); });
  expect(result.current.clinicalDictations.map(item => item.id)).toEqual(['new']);
  const snapshot = result.current.getSnapshot();
  act(() => { result.current.applySnapshot({ ...snapshot, clinicalDictations: [{ ...source, id: 'loaded' }] }, 'loaded-visit'); result.current.appendClinicalDictation({ ...source, id: 'appended' }); });
  expect(result.current.clinicalDictations.map(item => item.id)).toEqual(['loaded', 'appended']);
});

it('preserves legacy photo inclusion and saves explicit image choices independently of labels', () => {
  const first = renderHook(() => useChartState());
  act(() => first.result.current.applySnapshot({ ...first.result.current.getSnapshot(), imageRoles: { legacy: 'before' } }, 'visit'));
  act(() => first.result.current.setImageRole('legacy', null));
  act(() => first.result.current.setImageRole('excluded', 'after'));
  act(() => first.result.current.setImageInOwnerReport('included', true));
  const snapshot = first.result.current.getSnapshot();
  expect(ownerReportPhotoRoles(snapshot.imageRoles ?? {}, snapshot.ownerReportImageInclusion)).toEqual({ legacy: null, included: null });
  first.unmount();

  const next = renderHook(() => useChartState());
  expect(next.result.current.getSnapshot().ownerReportImageInclusion).toEqual({ legacy: true, excluded: false, included: true });
  expect(next.result.current.imageRoles).toEqual({ excluded: 'after' });
  act(() => next.result.current.startNewVisit());
  expect(next.result.current.getSnapshot().ownerReportImageInclusion).toBeUndefined();
  expect(next.result.current.imageRoles).toEqual({});
});

it('starts a separate consultation without dental carryover and restores its type', () => {
  const first = renderHook(() => useChartState());
  act(() => {
    first.result.current.handlePatientInfoChange('patientName', 'Milo');
    first.result.current.setPreToothMarks({ 108: 'missing' });
  });
  act(() => first.result.current.startNewVisit({ visitType: 'consultation', goneTeeth: [108] }));
  expect(first.result.current.patientInfo).toMatchObject({ patientName: 'Milo', visitType: 'consultation' });
  expect(first.result.current.getSnapshot().preMarks).toEqual({});
  const saved = first.result.current.getSnapshot();
  first.unmount();

  const restored = renderHook(() => useChartState());
  expect(restored.result.current.getSnapshot().patientInfo.visitType).toBe('consultation');
  act(() => restored.result.current.startNewVisit());
  expect(restored.result.current.getSnapshot().patientInfo.visitType).toBe('dental');
  act(() => restored.result.current.applySnapshot(saved, 'saved-consultation'));
  expect(restored.result.current.getSnapshot().patientInfo.visitType).toBe('consultation');
});

it('preserves untyped history and rejects a malformed visit type in imported snapshots', () => {
  const { result } = renderHook(() => useChartState());
  const saved = result.current.getSnapshot();
  const legacy = { ...saved, patientInfo: { ...saved.patientInfo } };
  delete legacy.patientInfo.visitType;
  expect(normalizeSnapshot(legacy).patientInfo).not.toHaveProperty('visitType');
  const malformed = { ...saved, patientInfo: { ...saved.patientInfo, visitType: 'phone' } };
  expect(normalizeSnapshot(malformed as never).patientInfo).not.toHaveProperty('visitType');
});
