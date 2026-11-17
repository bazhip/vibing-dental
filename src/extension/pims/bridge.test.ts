import { describe, expect, it, vi } from 'vitest';
import { createPageBridge } from './bridge';
import { shepherd } from './shepherd';
import type { AdapterContext, PimsAdapter, Status } from './types';

describe('physical exam preparation identity lifetime', () => {
  it.each(['navigation', 'session', 'provider', 'navigation-event', 'navigation-status', 'session-status', 'document-status'])('invalidates old tickets after observed %s changes and restoration', async change => {
    const recordId = '12345678-1234-1234-1234-123456789abc';
    let doc = change === 'navigation-event' ? document : document.implementation.createHTMLDocument();
    const originalDoc = doc;
    const originalUrl = new URL(`https://app.shepherd.vet/soap/${recordId}/objective`);
    let url = originalUrl;
    let token = '{"token":"original"}';
    let adapter: PimsAdapter = shepherd;
    doc.body.innerHTML = '<div data-test-id="soap-physicalExam-doctor-control"><span class="react-select__single-value">Dr Rivera</span></div><button data-test-groupid="soap-phyiscalExam"><span data-test-id="soap-physicalExam-name">Dental</span></button>';
    const activate = vi.fn();
    doc.querySelector('button')!.onclick = activate;
    const context = (): AdapterContext => ({ doc, url, currentUrl: () => url, fetch: vi.fn(), localStorage,
      sessionStorage: { getItem: () => token } as unknown as Storage, wait: async () => undefined });
    const bridge = createPageBridge(() => adapter, context);
    const target = { provider: 'shepherd' as const, consult: shepherd.status(context()).consult! };
    const available = await bridge.physicalExam({ operation: 'inspect', target });
    expect(available.ok && available.state).toBe('available');
    if (!available.ok || available.state !== 'available') return;
    const prepared = await bridge.physicalExam({ operation: 'prepare', target, pageId: available.pageId });
    expect(prepared.ok && prepared.state).toBe('prepared');
    if (!prepared.ok || prepared.state !== 'prepared') return;
    if (change.startsWith('navigation') && change !== 'navigation-event') url = new URL('https://app.shepherd.vet/dashboard');
    if (change.startsWith('session')) token = '{}';
    if (change === 'provider') adapter = { ...shepherd, id: 'instinct' };
    if (change === 'document-status') doc = document.implementation.createHTMLDocument();
    if (change === 'navigation-event') window.dispatchEvent(new PopStateEvent('popstate'));
    else if (change.endsWith('-status')) bridge.status();
    else expect((await bridge.physicalExam({ operation: 'inspect', target })).ok).toBe(false);
    url = originalUrl;
    token = '{"token":"original"}';
    adapter = shepherd;
    doc = originalDoc;
    expect(await bridge.physicalExam({ operation: 'open', target, pageId: prepared.pageId, ticket: prepared.ticket,
      templateId: prepared.templates[0].id })).toEqual({ ok: false, code: 'patient_changed' });
    expect(activate).not.toHaveBeenCalled();
    if (doc === document) doc.body.replaceChildren();
  });
});

describe('provider-neutral page bridge', () => {
  const consult = { viewId: 'patient-1', recordId: 'visit-1' };
  function setup() {
    let status: Status = { state: 'writable', patientName: 'Bella', patientNumber: '42', consult };
    const adapter: PimsAdapter = {
      id: 'daysmart', status: () => status,
      listFields: () => [{ title: 'Plan', kind: 'note', acceptsImage: false }],
      write: vi.fn(async () => ({ ok: true as const })),
      listAppointments: vi.fn(async () => ({ ok: true as const, appointments: [], failures: [] })),
      patientNumber: async () => '42',
    };
    const bridge = createPageBridge(() => adapter, () => ({ doc: document }) as AdapterContext);
    return { bridge, adapter, change: (next: Status) => { status = next; } };
  }
  const target = { provider: 'daysmart' as const, consult, patientName: 'Bella' };
  const item = { fieldTitle: 'Plan', text: 'New' };

  it('dispatches status, fields and appointments to the current provider', async () => {
    const { bridge } = setup();
    expect(bridge.status()).toMatchObject({ provider: 'daysmart', patientNumber: '42' });
    expect(bridge.listFields()).toHaveLength(1);
    expect(await bridge.listAppointments('2026-11-16', { navigate: false })).toEqual({ ok: true, appointments: [], failures: [] });
  });
  it('rechecks provider and encounter inside the injected write call', async () => {
    const { bridge, adapter, change } = setup();
    expect(await bridge.write(item, { ...target, provider: 'ezyvet' })).toEqual({ ok: false, code: 'patient_changed' });
    change({ state: 'writable', patientName: 'Bella', patientNumber: '42', consult: { ...consult, recordId: 'other' } });
    expect(await bridge.write(item, target)).toEqual({ ok: false, code: 'patient_changed' });
    expect(adapter.write).not.toHaveBeenCalled();
  });
  it('stamps imported appointments with their source provider', async () => {
    const { bridge, adapter } = setup();
    vi.mocked(adapter.listAppointments).mockResolvedValue({ ok: true, appointments: [{
      appointmentId: 'appointment-1', start: '2026-11-16T14:00:00Z', patientName: 'Bella', patientNumber: '42', ownerName: 'Smith', vet: null,
    }], failures: [] });
    const result = await bridge.listAppointments('2026-11-16', { navigate: false });
    expect(result.ok && result.appointments[0].provider).toBe('daysmart');
  });
  it('requires readable encounter identity even when names match', async () => {
    const { bridge, adapter, change } = setup();
    change({ state: 'writable', patientName: 'Bella', patientNumber: null, consult: null });
    expect(await bridge.write(item, { ...target, consult: null })).toEqual({ ok: false, code: 'patient_changed' });
    expect(adapter.write).not.toHaveBeenCalled();
  });
  it('refuses locked charts and never leaks names, numbers or URLs into diagnostics', async () => {
    const { bridge, adapter, change } = setup();
    const diagnostic = JSON.stringify(bridge.diagnostics());
    expect(diagnostic).not.toContain('Bella');
    expect(diagnostic).not.toContain('42');
    expect(diagnostic).not.toContain('patient-1');
    change({ state: 'locked', patientName: 'Bella', patientNumber: '42', consult });
    expect(await bridge.write(item, target)).toEqual({ ok: false, code: 'not_writable' });
    expect(adapter.write).not.toHaveBeenCalled();
  });
  it('writes only after the same patient and provider are confirmed', async () => {
    const { bridge, adapter } = setup();
    expect(await bridge.write(item, target)).toEqual({ ok: true });
    expect(adapter.write).toHaveBeenCalledOnce();
  });
});
