import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PimsNoteAutofill } from './PimsNoteAutofill';
import type { PimsTransport } from '../../utils/pims/extensionBridge';
import type { StoredRecordNote } from '../../types';
import '../../i18n';
let auth: (event: string, session: { user: { id: string } } | null) => void;
vi.mock('../../utils/supabaseClient', () => ({ supabase: { auth: { onAuthStateChange: (callback: typeof auth) => {
  auth = callback; callback('INITIAL_SESSION', { user: { id: 'user' } });
  return { data: { subscription: { unsubscribe: vi.fn() } } };
} } } }));
const note = { sections: [{ key: 'treatment' as const, heading: 'Treatment', lines: ['Reviewed clinical notes'] }] };
const target = { tabId: 7, provider: 'pulse', title: 'Patient encounter', origin: 'https://pulse.example' };
function setup(outcome = 'filled') {
  const noteAutofill = vi.fn(async (request: { operation: string }) => request.operation === 'list' ? { state: 'targets', targets: [target, { ...target, tabId: 8, title: 'Other encounter' }] }
    : request.operation === 'inspect' ? { state: 'fields', ...target, fields: ['Notes', 'Plan'] }
      : request.operation === 'prepare' ? { state: 'prepared', ...target, field: 'Notes', ticket: 'secret', existing_characters: 12, expires_at: new Date(Date.now() + 60_000).toISOString() }
        : { state: outcome });
  const transport = { noteAutofill } as unknown as PimsTransport;
  return { noteAutofill, props: { note, stored: null as StoredRecordNote | null, chartKey: 'chart', patientName: 'Bella', transport } };
}
async function prepare() {
  fireEvent.click(await screen.findByRole('button', { name: 'Fill an open PIMS note' }));
  fireEvent.change(await screen.findByLabelText('Destination tab'), { target: { value: '7' } });
  await screen.findByRole('option', { name: 'Notes' });
  fireEvent.change(screen.getByLabelText('Open field'), { target: { value: 'Notes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Prepare autofill' }));
  return screen.findByRole('checkbox');
}
afterEach(cleanup);
it('requires review and dispatches reviewed text once without stamping Sent', async () => {
  const { props, noteAutofill } = setup(); render(<PimsNoteAutofill {...props} />);
  const check = await prepare(); const fill = screen.getByRole('button', { name: 'Fill selected field' }); expect(fill).toBeDisabled();
  fireEvent.click(check); fireEvent.click(fill); fireEvent.click(fill);
  await screen.findByText('Filled. Verify the notes and save them in PIMS.');
  expect(noteAutofill.mock.calls.filter(([r]) => r.operation === 'fill')).toHaveLength(1);
  expect(noteAutofill).toHaveBeenLastCalledWith({ operation: 'fill', tabId: 7, ticket: 'secret', text: 'TREATMENT\nReviewed clinical notes' });
});
it('locks unknown outcomes until explicit preparation', async () => {
  const { props, noteAutofill } = setup('unknown'); render(<PimsNoteAutofill {...props} />);
  fireEvent.click(await prepare()); fireEvent.click(screen.getByRole('button', { name: 'Fill selected field' }));
  await screen.findByText('The outcome is unknown. Check PIMS before preparing another attempt.');
  expect(screen.queryByRole('button', { name: 'Fill selected field' })).not.toBeInTheDocument();
  expect(noteAutofill.mock.calls.filter(([r]) => r.operation === 'fill')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Prepare autofill' }));
  expect(await screen.findByRole('checkbox')).not.toBeChecked();
});
it.each(['source', 'patient', 'chart', 'disabled', 'auth'])('invalidates review after %s changes', async change => {
  const { props } = setup(); const view = render(<PimsNoteAutofill {...props} />); fireEvent.click(await prepare());
  if (change === 'auth') act(() => auth('SIGNED_OUT', null));
  else view.rerender(<PimsNoteAutofill {...props} {...(change === 'source' ? { stored: { text: 'Changed manually', lng: 'en', basedOn: 'x' } as StoredRecordNote } : change === 'patient' ? { patientName: 'Other' } : change === 'chart' ? { chartKey: 'other' } : { disabled: true })} />);
  expect(screen.queryByRole('button', { name: 'Fill selected field' })).not.toBeInTheDocument();
});
it('invalidates review when the selected field changes', async () => {
  const { props } = setup(); render(<PimsNoteAutofill {...props} />); fireEvent.click(await prepare());
  fireEvent.change(screen.getByLabelText('Open field'), { target: { value: 'Plan' } });
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
it('preserves manually edited notes as the only source when they cannot split', async () => {
  const { props } = setup(); render(<PimsNoteAutofill {...props} stored={{ text: 'My edited note', lng: 'en', basedOn: 'x' } as StoredRecordNote} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Fill an open PIMS note' }));
  expect(screen.getByLabelText('Review notes')).toHaveValue('My edited note');
  expect(screen.getByLabelText('Note source').querySelectorAll('option')).toHaveLength(1);
});
it('ignores deferred preparation after sign out', async () => {
  const { props, noteAutofill } = setup(); let resolve: (value: Awaited<ReturnType<typeof noteAutofill>>) => void;
  const original = noteAutofill.getMockImplementation()!;
  noteAutofill.mockImplementation(request => request.operation === 'prepare' ? new Promise(r => { resolve = r; }) as ReturnType<typeof original> : original(request));
  render(<PimsNoteAutofill {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Fill an open PIMS note' }));
  fireEvent.change(await screen.findByLabelText('Destination tab'), { target: { value: '7' } });
  await screen.findByRole('option', { name: 'Notes' });
  fireEvent.change(screen.getByLabelText('Open field'), { target: { value: 'Notes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Prepare autofill' }));
  act(() => auth('SIGNED_OUT', null));
  await act(async () => resolve!({ state: 'prepared', ...target, field: 'Notes', ticket: 'secret', expires_at: new Date(Date.now() + 60_000).toISOString(), existing_characters: 0 }));
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

it('invalidates review when switching source section or tab', async () => {
  const { props } = setup(); render(<PimsNoteAutofill {...props} />); fireEvent.click(await prepare());
  fireEvent.change(screen.getByLabelText('Note source'), { target: { value: 'treatment' } });
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Review notes')).toHaveValue('TREATMENT\nReviewed clinical notes');
  fireEvent.click(screen.getByRole('button', { name: 'Prepare autofill' }));
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('Destination tab'), { target: { value: '8' } });
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
it('expires prepared tickets and requires a new review', async () => {
  const { props, noteAutofill } = setup(); const original = noteAutofill.getMockImplementation()!;
  noteAutofill.mockImplementation(async request => {
    const result = await original(request);
    return request.operation === 'prepare' ? { ...result, expires_at: new Date(Date.now() + 200).toISOString() } : result;
  });
  render(<PimsNoteAutofill {...props} />); fireEvent.click(await prepare());
  await screen.findByText('Preparation expired. Check the destination and prepare again.');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
it('keeps the unknown warning across source changes until explicit new preparation', async () => {
  const { props } = setup('unknown'); render(<PimsNoteAutofill {...props} />); fireEvent.click(await prepare());
  fireEvent.click(screen.getByRole('button', { name: 'Fill selected field' }));
  await screen.findByText('The outcome is unknown. Check PIMS before preparing another attempt.');
  fireEvent.change(screen.getByLabelText('Note source'), { target: { value: 'treatment' } });
  expect(screen.getByText('The outcome is unknown. Check PIMS before preparing another attempt.')).toBeInTheDocument();
});
it('blocks empty source text', async () => {
  const { props } = setup(); render(<PimsNoteAutofill {...props} stored={{ text: '', source: 'edited', lng: 'en', basedOn: 'x' }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Fill an open PIMS note' }));
  fireEvent.change(await screen.findByLabelText('Destination tab'), { target: { value: '7' } });
  await screen.findByRole('option', { name: 'Notes' });
  fireEvent.change(screen.getByLabelText('Open field'), { target: { value: 'Notes' } });
  expect(screen.getByRole('button', { name: 'Prepare autofill' })).toBeDisabled();
});
it('clears cached destination titles across account transitions', async () => {
  const { props } = setup(); render(<PimsNoteAutofill {...props} />); await prepare();
  act(() => auth('SIGNED_OUT', null)); act(() => auth('SIGNED_IN', { user: { id: 'another-user' } }));
  expect(screen.queryByRole('option', { name: /Patient encounter/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
it('keeps the dispatch locked past ticket expiry and reports unknown on failed fill', async () => {
  const { props, noteAutofill } = setup(); const original = noteAutofill.getMockImplementation()!;
  let fail: () => void = () => {};
  noteAutofill.mockImplementation(async request => {
    if (request.operation === 'fill') return new Promise((_resolve, reject) => { fail = () => reject(); });
    const result = await original(request);
    return request.operation === 'prepare' ? { ...result, expires_at: new Date(Date.now() + 250).toISOString() } : result;
  });
  const busy = vi.fn(); render(<PimsNoteAutofill {...props} onBusyChange={busy} />);
  fireEvent.click(await prepare()); fireEvent.click(screen.getByRole('button', { name: 'Fill selected field' }));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
  expect(screen.queryByText('Preparation expired. Check the destination and prepare again.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Close note autofill' })).toBeDisabled();
  expect(busy).toHaveBeenLastCalledWith(true);
  await act(async () => fail());
  await screen.findByText('The outcome is unknown. Check PIMS before preparing another attempt.');
  expect(busy).toHaveBeenLastCalledWith(false);
});
it('rejects a prepared response for a different field', async () => {
  const { props, noteAutofill } = setup(); const original = noteAutofill.getMockImplementation()!;
  noteAutofill.mockImplementation(async request => {
    const result = await original(request); return request.operation === 'prepare' ? { ...result, field: 'Wrong field' } : result;
  });
  render(<PimsNoteAutofill {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Fill an open PIMS note' }));
  fireEvent.change(await screen.findByLabelText('Destination tab'), { target: { value: '7' } });
  await screen.findByRole('option', { name: 'Notes' });
  fireEvent.change(screen.getByLabelText('Open field'), { target: { value: 'Notes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Prepare autofill' }));
  await screen.findByText('Notes were not filled. Check the destination and prepare again.');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
it('can inspect the same tab again after opening a missing editor', async () => {
  const { props, noteAutofill } = setup(); const original = noteAutofill.getMockImplementation()!;
  let inspections = 0;
  noteAutofill.mockImplementation(async request => request.operation === 'inspect' && ++inspections === 1
    ? { state: 'fields', ...target, fields: [] } : original(request));
  render(<PimsNoteAutofill {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Fill an open PIMS note' }));
  fireEvent.change(await screen.findByLabelText('Destination tab'), { target: { value: '7' } });
  await screen.findByText('No supported open fields were found. Open the exact note editor in PIMS and select the tab again.');
  fireEvent.click(screen.getByRole('button', { name: 'Inspect open fields' }));
  await screen.findByRole('option', { name: 'Notes' });
});
it('falls back to the whole edited note if the selected section no longer exists', async () => {
  const { props } = setup(); const view = render(<PimsNoteAutofill {...props} />); await prepare();
  fireEvent.change(screen.getByLabelText('Note source'), { target: { value: 'treatment' } });
  view.rerender(<PimsNoteAutofill {...props} stored={{ text: 'New manually edited note', source: 'edited', lng: 'en', basedOn: 'x' }} />);
  expect(screen.getByLabelText('Note source')).toHaveValue('all');
  expect(screen.getByLabelText('Review notes')).toHaveValue('New manually edited note');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
