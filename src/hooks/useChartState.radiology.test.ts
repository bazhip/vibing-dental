import { isRadiologyReportReviewed, radiologySourceBasis, radiologyReviewBasis } from '../utils/radiologyReportState';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeSnapshot, useChartState } from './useChartState';

const report = {
 radiologyHistory:'Prior fracture of 108.',radiologyTechnique:'Intraoral dental views.',radiologyQuestion:'Assess 108.',
 radiologyReport:'Recorded findings: distal root bone loss at 108.',radiologyReportLanguage:'en' as const,
 radiologyReportBasis:'source',radiologyReviewedBasis:'reviewed',radiologyReportGeneratedAt:'2026-11-17T12:00:00Z',
};
const values=new Map<string,string>();
beforeEach(()=>{values.clear();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key),clear:()=>values.clear()});});
afterEach(()=>vi.unstubAllGlobals());
describe('radiology report chart persistence',()=>{
 it('saves report and context separately from original findings in a snapshot',()=>{
  const {result}=renderHook(()=>useChartState());
  act(()=>result.current.setPatientInfo(prev=>({...prev,radiographicFindings:'108: bone loss',...report})));
  expect(result.current.getSnapshot().patientInfo).toMatchObject({...report,radiographicFindings:'108: bone loss'});
 });
 it('restores report/context from the local working copy after remount',()=>{
  const first=renderHook(()=>useChartState());
  act(()=>first.result.current.setPatientInfo(prev=>({...prev,...report})));
  first.unmount();
  const next=renderHook(()=>useChartState());
  expect(next.result.current.getSnapshot().patientInfo).toMatchObject(report);
 });
 it('restores valid report/context fields from cloud or PDF snapshot data',()=>{
  const {result}=renderHook(()=>useChartState());
  const snap=result.current.getSnapshot();
  act(()=>result.current.applySnapshot({...snap,patientInfo:{...snap.patientInfo,...report}},'chart-1'));
  expect(result.current.patientInfo).toMatchObject(report);
 });
 it('preserves review through normalized cloud-style object key reordering',()=>{
  const {result}=renderHook(()=>useChartState());
  const initial=result.current.getSnapshot();
  const snapshot={...initial,patientInfo:{...initial.patientInfo,...report}};
  snapshot.patientInfo.radiologyReportBasis=radiologySourceBasis(snapshot);
  snapshot.patientInfo.radiologyReviewedBasis=radiologyReviewBasis(snapshot,'en');
  expect(isRadiologyReportReviewed(snapshot,'en')).toBe(true);
  const cloud=JSON.parse(JSON.stringify(snapshot,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().reverse().map(key=>[key,value[key]])):value));
  act(()=>result.current.applySnapshot(cloud,'cloud-chart'));
  expect(isRadiologyReportReviewed(result.current.getSnapshot(),'en')).toBe(true);
 });
 it('clears old report/context/review on a new visit while preserving patient identity',()=>{
  const {result}=renderHook(()=>useChartState());
  act(()=>result.current.setPatientInfo(prev=>({...prev,patientName:'Milo',patientNumber:'123',...report})));
  act(()=>result.current.startNewVisit());
  expect(result.current.patientInfo.patientName).toBe('Milo');
  for(const key of Object.keys(report)) expect(result.current.patientInfo).not.toHaveProperty(key);
 });
 it('accepts older snapshots without introducing report or review claims',()=>{
  const {result}=renderHook(()=>useChartState());
  const snapshot=normalizeSnapshot(result.current.getSnapshot());
  for(const key of Object.keys(report)) expect(snapshot.patientInfo).not.toHaveProperty(key);
 });
 it('drops malformed new report fields and invalid review metadata from imported data',()=>{
  const {result}=renderHook(()=>useChartState());
  const snapshot=result.current.getSnapshot();
  const normalized=normalizeSnapshot({...snapshot,patientInfo:{...snapshot.patientInfo,...report,
   radiologyHistory:{untrusted:true},radiologyReport:[],radiologyReportLanguage:'xx'}} as never);
  for(const key of ['radiologyHistory','radiologyReport','radiologyReportLanguage','radiologyReportBasis','radiologyReviewedBasis','radiologyReportGeneratedAt']) expect(normalized.patientInfo).not.toHaveProperty(key);
 });
});
