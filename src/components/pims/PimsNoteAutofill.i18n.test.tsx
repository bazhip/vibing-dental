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
