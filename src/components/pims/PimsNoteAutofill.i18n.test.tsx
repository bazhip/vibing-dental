import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../../i18n/testing/pseudo';
import i18n from '../../i18n';
import { PimsNoteAutofill } from './PimsNoteAutofill';
import type { PimsTransport } from '../../utils/pims/extensionBridge';

vi.mock('../../utils/supabaseClient', () => ({ supabase: { auth: { onAuthStateChange: (callback: (event: string, session: { user: { id: string } }) => void) => {
  callback('INITIAL_SESSION', { user: { id: 'user' } });
  return { data: { subscription: { unsubscribe: vi.fn() } } };
} } } }));
beforeEach(installPseudoLocale);
afterEach(async () => { cleanup(); await restoreLocale(); });
it.each(['filled', 'unknown', 'blocked'] as const)('translates review controls and the %s result', async outcome => {
  const destination = { provider: 'pulse', origin: 'https://pulse.example', title: 'Encounter' };
  const noteAutofill = vi.fn(async (request: { operation: string }) => request.operation === 'list'
    ? { state: 'targets', targets: [{ ...destination, tabId: 7 }] } : request.operation === 'inspect'
      ? { state: 'fields', ...destination, fields: ['Notes'] } : request.operation === 'prepare'
        ? { state: 'prepared', ...destination, field: 'Notes', ticket: 'ticket', existing_characters: 0, expires_at: new Date(Date.now() + 60_000).toISOString() }
        : { state: outcome });
  render(<PimsNoteAutofill chartKey="chart" patientName="Bella" note={{ sections: [] }} stored={{ text: 'Reviewed note', source: 'edited', lng: 'en', basedOn: 'x' }} transport={{ noteAutofill } as unknown as PimsTransport} />);
  expect(findUntranslated(document.body)).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:noteAutofill.open') }));
  await screen.findByRole('option', { name: /Encounter/ });
  expect(findUntranslated(document.body, ['Reviewed note', 'Covetrus Pulse · Encounter · https://pulse.example'])).toEqual([]);
  fireEvent.change(screen.getByLabelText(i18n.t('pims:noteAutofill.tab')), { target: { value: '7' } });
  await screen.findByRole('option', { name: 'Notes' });
  fireEvent.change(screen.getByLabelText(i18n.t('pims:noteAutofill.field')), { target: { value: 'Notes' } });
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:noteAutofill.prepare') }));
  fireEvent.click(await screen.findByRole('checkbox'));
  expect(findUntranslated(document.body, ['Reviewed note', 'Covetrus Pulse · Encounter · https://pulse.example', 'Notes'])).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:noteAutofill.fill') }));
  await screen.findByText(i18n.t(`pims:noteAutofill.${outcome}`));
  expect(findUntranslated(document.body, ['Reviewed note', 'Covetrus Pulse · Encounter · https://pulse.example', 'Notes'])).toEqual([]);
});
it.each(['prepared','unknown','missing','conflict','partial'] as const)('translates mapped %s state and mapping options', async scenario => {
  const destination = { provider: 'pulse' as const, origin: 'https://clinic.evetpractice.com', title: 'Encounter' };
  const key = { ...destination, template_id: 'record-note-v1' };
  let fills = 0;
  const mappingBackend = { load: async () => ({ ...key, version: 1, mapping: { treatment: scenario === 'missing' ? 'Missing editor' : 'Notes', ...(scenario === 'partial' ? { exam: 'Plan' } : {}) } }), save: async () => { throw { code: 'conflict' }; } };
  const noteAutofill = async (request: { operation: string; field?: string }) => request.operation === 'list' ? { state: 'targets', targets: [{ ...destination, tabId: 7 }] }
    : request.operation === 'inspect' ? { state: 'fields', ...destination, fields: scenario === 'partial' ? ['Notes','Plan'] : ['Notes'] } : request.operation === 'prepare'
      ? { state: 'prepared', ...destination, field: request.field, ticket: `ticket-${request.field}`, existing_characters: 0, expires_at: new Date(Date.now() + 60000).toISOString() } : { state: scenario === 'partial' ? ++fills === 1 ? 'filled' : 'blocked' : 'unknown' };
  render(<PimsNoteAutofill chartKey="chart" patientName="Bella" note={{ sections: [{ key: 'treatment', heading: 'Clinical section', lines: ['Recorded source'] }, ...(scenario === 'partial' ? [{ key: 'exam' as const, heading: 'Additional section', lines: ['Extra recorded source'] }] : [])] }} stored={null} mappingBackend={mappingBackend} transport={{ noteAutofill } as unknown as PimsTransport} />);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:noteAutofill.open') }));
  fireEvent.change(await screen.findByLabelText(i18n.t('pims:noteAutofill.tab')), { target: { value: '7' } });
  await screen.findByRole('option', { name: 'Notes' }); fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:noteAutofill.mapSections') }));
  fireEvent.click(screen.getByText(i18n.t('pims:noteAutofill.mappingOptions')));
  if (scenario === 'conflict') { fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:noteAutofill.saveMapping') })); await screen.findByText(i18n.t('pims:noteAutofill.mappingStatus.conflict')); }
  else if (scenario !== 'missing') {
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:noteAutofill.prepare') })); await screen.findByRole('checkbox');
    if (scenario === 'unknown' || scenario === 'partial') { fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:noteAutofill.pasteAll') })); await screen.findByText(i18n.t(`pims:noteAutofill.${scenario}`)); }
  }
  expect(findUntranslated(document.body, ['Clinical section', 'Additional section', 'CLINICAL SECTION\nRecorded source', 'CLINICAL SECTION\nRecorded source\n\nADDITIONAL SECTION\nExtra recorded source', 'Recorded source', 'Plan', 'Notes', 'Missing editor', 'Covetrus Pulse · Encounter · https://clinic.evetpractice.com'])).toEqual([]);
});
