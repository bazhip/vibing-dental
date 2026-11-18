import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { localDateISO } from './utils/localDate';
import { sampleOwnerReportSnapshot } from './utils/ownerReportSample';
import type { VoiceInputButton } from './components/VoiceInputButton';

const state = vi.hoisted(() => ({ voice: null as React.ComponentProps<typeof VoiceInputButton> | null, refine: vi.fn() }));
vi.mock('./components/VoiceInputButton', async original => {
  const actual = await original<typeof import('./components/VoiceInputButton')>();
  return { ...actual, VoiceInputButton: (props: React.ComponentProps<typeof VoiceInputButton>) => { state.voice = props; return null; } };
});
vi.mock('./utils/radiologyReportAi', () => ({ draftRadiologyReport: state.refine }));
vi.mock('./native/aiConsent', () => ({ ensureAiConsent: async () => true }));
vi.mock('./hooks/useProfile', async original => {
  const actual = await original<typeof import('./hooks/useProfile')>();
  return { ...actual, useProfile: () => ({ ...actual.useProfile(), loaded: true, practiceKnown: true, aiEnabled: true }) };
});
const cloud = vi.hoisted(() => ({ enabled: true, status: 'saved', dirty: false, online: true, saveError: '', awaitingClinical: false,
  lastSavedAt: '', listCharts: vi.fn(async () => ({ rows: [], hasMore: false })), listPatientVisits: vi.fn(async () => []),
  openChart: vi.fn(async () => true), fetchChart: vi.fn(), deleteChart: vi.fn(), clearRecalls: vi.fn(),
  confirmDiscardIfDirty: vi.fn(async () => true), skipDuplicateCheckFor: vi.fn(), saveNow: vi.fn(), signOut: vi.fn(), restoreRevision: vi.fn() }));
vi.mock('./hooks/useCloudSync', () => ({ useCloudSync: () => cloud }));
function storage(): Storage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, String(value)); }, removeItem: key => { values.delete(key); }, clear: () => values.clear(), key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
}
vi.stubGlobal('localStorage', storage()); vi.stubGlobal('sessionStorage', storage());
import EntryGrid from './EntryGrid';
import { DialogHost } from './components/ui/dialogs';
beforeAll(() => {
  window.ResizeObserver = window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia ?? ((media: string) => ({ matches: false, media, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => {}; window.scrollTo = () => {};
});
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); state.voice = null; state.refine.mockReset().mockResolvedValue('Refined: 409 possible resorption.');
  localStorage.setItem('vibing-dental.onboarding.seen.v1', '1');
  localStorage.setItem('vibing-dental.chart.patientInfo.v1', JSON.stringify({ ...sampleOwnerReportSnapshot().patientInfo, patientName: 'Milo', patientNumber: '7', date: localDateISO(), radiologyReport: 'Typed clinical context.', radiographicFindings: 'Typed clinical context.' }));
  window.history.replaceState(null, '', '/#/chart/imaging');
});
it('appends radiology dictation to the visible text and refines after completion in the dictation language', async () => {
  render(<><EntryGrid /><DialogHost /></>);
  await waitFor(() => expect(state.voice).not.toBeNull());
  act(() => state.voice!.handlers.appendRadiographicFindings!('409: possible resorption.', 'fr'));
  expect(screen.getByRole('textbox', { name: /Radiographic report/i })).toHaveValue('Typed clinical context.\n409: possible resorption.');
  expect(state.refine).not.toHaveBeenCalled();
  expect(state.voice!.context.patientInfo.radiologyReportLanguage).toBe('fr');
  expect(state.voice!.context.patientInfo.radiographicFindings).toBe('Typed clinical context.\n409: possible resorption.');
  act(() => state.voice!.onDictationComplete?.('fr'));
  await waitFor(() => expect(screen.getByRole('textbox', { name: /Radiographic report/i })).toHaveValue('Refined: 409 possible resorption.'));
  expect(state.refine).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ patientInfo: expect.objectContaining({ radiologyReport: 'Typed clinical context.\n409: possible resorption.' }) }), 'fr');
  act(() => state.voice!.onDictationComplete?.('fr'));
  expect(state.refine).toHaveBeenCalledOnce();
});
it('does not refine when a dictation completes without adding radiology text', async () => {
  render(<><EntryGrid /><DialogHost /></>);
  await waitFor(() => expect(state.voice).not.toBeNull());
  act(() => state.voice!.onDictationComplete?.('en'));
  expect(state.refine).not.toHaveBeenCalled();
});
