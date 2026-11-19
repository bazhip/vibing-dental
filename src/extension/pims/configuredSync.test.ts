import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredSyncSource } from './configuredSync';
import type { AdapterContext } from './types';
import type { SyncIdentity, SyncTicket } from '../../utils/pims/sync';
import { dayBounds } from './shared';

const identity: SyncIdentity = { provider: 'daysmart', origin: 'https://clinic.vettersoftware.com', tenant_id: 'Configured practice', connection_revision: 2 };
const bounds = dayBounds('2026-11-17')!;
const row = { appointment_id: 'a', patient_id: 'p', clinician_id: 'c', encounter_id: null, starts_at: bounds.start, ends_at: null, status: 'active' as const };
function fixture() {
  const values = new Map([['Vetter-Token','session-secret']]);
  const storage = { getItem: (key: string) => values.get(key) ?? null } as Storage;
  let url = new URL(`${identity.origin}/schedule`);
  const context: AdapterContext = { doc: document, url, currentUrl: () => url, localStorage: storage, sessionStorage: storage, fetch: vi.fn(), wait: async () => {} };
  const read = vi.fn(async () => ({ items: [{ ...row }], failures: [] }));
  const ticket: SyncTicket = { id: 'run', connection_id: 'connection', connection_revision: 2, generation: 1,
    started_at: new Date(Date.now()-1000).toISOString(), expires_at: new Date(Date.now()+60000).toISOString(), state: 'capturing',
    scope: { requested_date: '2026-11-17', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, window_start: bounds.start, window_end: bounds.end } };
  return { context, values, read, ticket, source: () => configuredSyncSource(context, identity, read, { userConfirmed: true }), setUrl: (value: string) => { url = new URL(value); } };
}
beforeEach(() => { document.body.innerHTML = ''; });
describe('configured-practice sync source', () => {
  it('returns configured identity after explicit confirmation without claiming provider clinic observation', async () => {
    const { source, read } = fixture();
    expect(await source().readIdentity()).toEqual(identity);
    expect(read).not.toHaveBeenCalled();
  });
  it.each([undefined, false])('requires explicit confirmation before any capture (%s)', async userConfirmed => {
    const { context, read, ticket } = fixture();
    const source = configuredSyncSource(context, identity, read, { userConfirmed });
    await expect(source.readIdentity()).rejects.toMatchObject({ code: 'identity_changed' });
    await expect(source.capture(ticket)).rejects.toMatchObject({ code: 'identity_changed' });
    expect(read).not.toHaveBeenCalled();
  });
  it('pins confirmation and expected identity rather than observing mutable caller objects', async () => {
    const { context, read } = fixture();
    const options = { userConfirmed: false }, binding = { ...identity };
    const source = configuredSyncSource(context, binding, read, options);
    options.userConfirmed = true; binding.tenant_id = 'other';
    await expect(source.readIdentity()).rejects.toMatchObject({ code: 'identity_changed' });
  });
  it('emits bounded unknown-completeness captures with raw identifiers only', async () => {
    const { source, ticket, read } = fixture();
    expect(await source().capture(ticket)).toMatchObject({ protocol: 1, generation: 1, identity, completeness: 'unknown', items: [row], failures: [] });
    expect(read).toHaveBeenCalledExactlyOnceWith('2026-11-17', expect.any(Function));
  });
  it('keeps an observed session switch invalid even if the original token is restored', async () => {
    const { source, values, ticket } = fixture(); const sync = source();
    await sync.readIdentity(); values.set('Vetter-Token','other');
    await expect(sync.capture(ticket)).rejects.toMatchObject({ code: 'identity_changed' });
    values.set('Vetter-Token','session-secret');
    await expect(sync.readIdentity()).rejects.toMatchObject({ code: 'identity_changed' });
  });
  it('rejects a session change during capture', async () => {
    const { source, read, values, ticket } = fixture();
    read.mockImplementation(async () => { values.set('Vetter-Token','other'); return { items: [row], failures: [] }; });
    await expect(source().capture(ticket)).rejects.toMatchObject({ code: 'identity_changed' });
  });
  it('invalidates a changed route and document', async () => {
    const { source, setUrl, context } = fixture(); const sync = source();
    await sync.readIdentity(); setUrl(`${identity.origin}/other`);
    await expect(sync.readIdentity()).rejects.toMatchObject({ code: 'identity_changed' });
    setUrl(`${identity.origin}/schedule`);
    await expect(sync.readIdentity()).rejects.toMatchObject({ code: 'identity_changed' });
    const other = source(); context.doc = document.implementation.createHTMLDocument();
    await expect(other.readIdentity()).rejects.toMatchObject({ code: 'identity_changed' });
  });
  it.each(['expired','revision','date-window','duplicate','invalid-id'] as const)('rejects invalid %s capture state', async mode => {
    const { source, ticket, read } = fixture();
    if(mode==='expired') ticket.expires_at = new Date(Date.now()-1).toISOString();
    if(mode==='revision') ticket.connection_revision++;
    if(mode==='date-window') ticket.scope.requested_date = '2026-11-18';
    if(mode==='duplicate') read.mockResolvedValue({items:[row,row],failures:[]});
    if(mode==='invalid-id') read.mockResolvedValue({items:[{...row,patient_id:''}],failures:[]});
    await expect(source().capture(ticket)).rejects.toMatchObject({code: expect.stringMatching(/stale_run|invalid_capture/)});
  });
});

it('disposes navigation listeners and invalidates configured source permanently', async () => {
  const {source}=fixture(); const sync=source();
  await sync.readIdentity(); sync.dispose!();
  await expect(sync.readIdentity()).rejects.toMatchObject({code:'identity_changed'});
});

it.each(['accessToken', 'practice', 'endpoint'])('pins the Instinct %s witness and permanently rejects its replacement', async change => {
  const { context, values, read } = fixture();
  context.url = new URL('https://clinic.instinctvet.cloud/#/calendar');context.currentUrl = () => context.url;
  const state = { value: { accessToken: 'secret', practice: { id: 'one', apiUrl: 'https://api.instinctvet.com/graphql' } } };
  const store = () => values.set('instinct:user-state', JSON.stringify(state));store();
  const original = JSON.stringify(state);
  const binding = { ...identity, provider: 'instinct' as const, origin: context.url.origin };
  const source = configuredSyncSource(context, binding, read, { userConfirmed: true });
  expect(await source.readIdentity()).toEqual(binding);
  if (change === 'accessToken') state.value.accessToken = 'other';
  if (change === 'practice') state.value.practice.id = 'other';
  if (change === 'endpoint') state.value.practice.apiUrl = 'https://other.instinctvet.com/graphql';
  store();await expect(source.readIdentity()).rejects.toMatchObject({ code: 'identity_changed' });
  values.set('instinct:user-state', original);
  await expect(source.readIdentity()).rejects.toMatchObject({ code: 'identity_changed' });
});
