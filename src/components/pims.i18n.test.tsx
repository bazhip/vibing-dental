import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import i18n from '../i18n';
import type { InspectResult } from '../extension/protocol';
import { effectiveMap } from '../utils/pims/mapping';
import type { RecordNote } from '../utils/recordNote';
import type { ChartSnapshot as PreviewSnapshot } from './PdfPreviewModal';

const mocks = vi.hoisted(() => ({
  ping: vi.fn(),
  inspect: vi.fn(),
  send: vi.fn(),
}));

vi.mock('../utils/pims/extensionBridge', () => ({
  ping: mocks.ping,
  inspect: mocks.inspect,
  send: mocks.send,
  diagnose: vi.fn(),
  appointments: vi.fn(),
  startChart: vi.fn(),
  takePendingPatient: vi.fn(),
  physicalExam: vi.fn(),
  instinctSubmission: vi.fn(),
  radiologyAutofill: vi.fn(),
  noteAutofill: vi.fn(),
  extensionAvailable: () => true,
}));
vi.mock('../hooks/usePimsFieldMap', () => ({
  usePimsFieldMap: () => ({ map: effectiveMap({ exam: 'Assessment' }), save: vi.fn(async () => {}), reset: vi.fn(async () => {}) }),
}));
vi.mock('../utils/edgeFunctions', () => ({ markPimsSent: vi.fn(async () => ({ sentAt: '2026-11-15T10:00:00Z' })) }));
vi.mock('../utils/pims/chartPicture', () => ({ renderChartPicture: vi.fn(async () => 'data:image/png;base64,AAAA') }));
vi.mock('./ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true), toast: vi.fn() }));
vi.mock('../utils/supabaseClient', () => ({ supabase: null, cloudEnabled: false }));

import { SendToEzyvetDialog } from './SendToEzyvetDialog';

// ezyVet field titles come from the ezyVet page, as ezyVet shows them.
// 'Assessment' is the vet's saved title, reported as not found.
const PAGE_TEXT = ['Plan', 'Physical Exam', 'Discharge Summary', 'Assessment'];

const writable: InspectResult = {
  tab: { id: 1, title: 'Consult — ezyVet' },
  candidates: 2,
  status: { state: 'writable', patientName: 'Bella', patientNumber: null, consult: { viewId: '1', recordId: '1' } },
  fields: [
    { title: 'Physical Exam', kind: 'note', acceptsImage: false },
    { title: 'Plan', kind: 'note', acceptsImage: false },
    { title: 'Discharge Summary', kind: 'dischargeSummary', acceptsImage: true },
  ],
};

const note: RecordNote = {
  sections: [
    { key: 'exam', heading: 'Oral exam', lines: ['Normal'] },
    { key: 'treatment', heading: 'Treatment report', lines: ['Done'] },
  ],
};

function renderDialog(over: Partial<React.ComponentProps<typeof SendToEzyvetDialog>> = {}) {
  return render(
    <SendToEzyvetDialog
      open
      onClose={() => {}}
      note={note}
      stored={null}
      chartSnapshot={{ species: 'canine' } as unknown as PreviewSnapshot}
      chartId="c1"
      patientName="Bella"
      patientNumber=""
      sentAt="2026-11-01T09:00:00Z"
      onSent={() => {}}
      {...over}
    />,
  );
}

const pseudo = (key: string): string => (i18n.t as unknown as (k: string) => string)(key);

beforeEach(async () => {
  vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true');
  vi.clearAllMocks();
  mocks.ping.mockResolvedValue({ version: '1' });
  mocks.inspect.mockResolvedValue(writable);
  await installPseudoLocale();
});
afterEach(async () => { cleanup(); vi.unstubAllEnvs(); await restoreLocale(); });

describe('Send to ezyVet dialog (pseudo-locale)', () => {
  it('writable: target, rows, actions', async () => {
    renderDialog();
    await screen.findByText(pseudo('pims:rows.heading'));
    expect(findUntranslated(document.body, PAGE_TEXT)).toEqual([]);
  });

  it('edited note that cannot be split', async () => {
    renderDialog({ stored: { text: 'My own note', source: 'edited', lng: 'en', basedOn: 'x' } });
    await screen.findByText(pseudo('pims:editedNotice'));
    expect(findUntranslated(document.body, PAGE_TEXT)).toEqual([]);
  });

  it('not installed', async () => {
    mocks.ping.mockResolvedValue(null);
    renderDialog();
    await screen.findByText(pseudo('pims:install.title'));
    expect(findUntranslated(document.body, PAGE_TEXT)).toEqual([]);
  });

  it('no tab', async () => {
    mocks.inspect.mockResolvedValue({ tab: null, candidates: 0, status: null, fields: [] });
    renderDialog();
    await screen.findByText(pseudo('pims:noTab'));
    expect(findUntranslated(document.body, PAGE_TEXT)).toEqual([]);
  });

  it('locked', async () => {
    mocks.inspect.mockResolvedValue({ ...writable, status: { state: 'locked', patientName: 'Bella' }, fields: [] });
    renderDialog();
    await screen.findByText(pseudo('pims:state.locked'));
    expect(findUntranslated(document.body, PAGE_TEXT)).toEqual([]);
  });

  it('results', async () => {
    mocks.send.mockResolvedValue({
      ok: true,
      results: [
        { fieldTitle: 'Plan', result: { ok: true } },
        { fieldTitle: 'Discharge Summary', result: { ok: false, code: 'save_not_confirmed' } },
        { fieldTitle: 'Physical Exam', result: { ok: false, code: 'extension_error' } },
        { fieldTitle: 'Assessment', result: { ok: false, code: 'patient_changed' } },
      ],
    });
    renderDialog();
    await screen.findByText(pseudo('pims:rows.heading'));
    fireEvent.click(screen.getByRole('button', { name: pseudo('pims:actions.send') }));
    await screen.findByText(pseudo('pims:results.title'));
    expect(findUntranslated(document.body, PAGE_TEXT)).toEqual([]);
  });
});
