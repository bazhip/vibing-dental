import { describe, expect, it, vi } from 'vitest';
import { createPageBridge } from './bridge';
import { instinct } from './instinct';
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


describe('Instinct submission page lifetime', () => {
  function fixture() {
    const initialUrl = new URL('https://clinic.instinctvet.cloud/#/patient/123/charts/documents');
    let url = initialUrl, doc = document;
    const initialState = JSON.stringify({ value: { accessToken: 'secret', practice: { apiUrl: 'https://api.instinctvet.com/graphql' } } });
    let state = initialState;
    let adapter: PimsAdapter = instinct;
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ data: { uploadChartFile: { id: 'file' } } }) }) as Response);
    const context = (): AdapterContext => ({ doc, url, currentUrl: () => url, fetch: fetcher, localStorage,
      sessionStorage: { getItem: () => state } as unknown as Storage, wait: async () => undefined });
    const bridge = createPageBridge(() => adapter, context);
    return { bridge, fetcher, change: (kind: string) => {
      if (kind === 'navigation') url = new URL('https://clinic.instinctvet.cloud/#/patient/456/charts/documents');
      if (kind === 'session') state = '{}';
      if (kind === 'provider') adapter = shepherd;
      if (kind === 'document') doc = document.implementation.createHTMLDocument();
      if (kind === 'event') window.dispatchEvent(new PopStateEvent('popstate'));
    }, restore: () => { url = initialUrl; state = initialState; adapter = instinct; doc = document; } };
  }
  const submission = (prepared: { ticket: string; expires_at: string }) => ({ operation: 'submit' as const,
    ticket: prepared.ticket, expires_at: prepared.expires_at, id: 'attempt', location_id: '1', label: 'Record',
    recorded_at: '2026-11-17T00:00:00Z', bytes: [37,80,68,70,45,1], source: { chartId: 'chart', draftId: 'draft', version: 1 } });
  it('retains the page preparation across calls and submits it once', async () => {
    const { bridge, fetcher } = fixture();
    const prepared = await bridge.instinctSubmission({ operation: 'prepare' });
    expect(prepared.state).toBe('prepared');
    if (prepared.state !== 'prepared') return;
    expect(await bridge.instinctSubmission(submission(prepared))).toEqual({ state: 'submitted', id: 'attempt', file_id: 'file' });
    expect(await bridge.instinctSubmission(submission(prepared))).toEqual({ state: 'blocked' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['navigation', 'session', 'provider', 'document', 'event'])('invalidates tickets after observed %s and restoration', async kind => {
    const { bridge, fetcher, change, restore } = fixture();
    const prepared = await bridge.instinctSubmission({ operation: 'prepare' });
    expect(prepared.state).toBe('prepared');
    if (prepared.state !== 'prepared') return;
    change(kind);
    bridge.status();
    restore();
    expect(await bridge.instinctSubmission(submission(prepared))).toEqual({ state: 'blocked' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('radiology preparation bridge lifetime', () => {
  it.each(['navigation', 'document'])('does not revive a ticket after an observed %s change and restoration', async change => {
    const initialDoc = document.implementation.createHTMLDocument('Radiology request');
    initialDoc.body.innerHTML = '<textarea name="notes"></textarea>';
    let doc = initialDoc;
    const initialUrl = new URL('https://app.radimal.ai/request-consult');
    let url = initialUrl;
    const context = (): AdapterContext => ({ doc, url, currentUrl: () => url, fetch: vi.fn(), localStorage,
      sessionStorage, wait: async () => undefined });
    const bridge = createPageBridge(() => null, context);
    const prepared = await bridge.radiologyAutofill({ operation: 'prepare' });
    expect(prepared.state).toBe('prepared');
    if (prepared.state !== 'prepared') return;
    if (change === 'navigation') url = new URL('https://app.radimal.ai/other');
    else doc = document.implementation.createHTMLDocument('Another page');
    bridge.status();
    doc = initialDoc; url = initialUrl;
    expect(await bridge.radiologyAutofill({ operation: 'fill', ticket: prepared.ticket, text: 'Reviewed findings' })).toEqual({ state: 'blocked' });
    expect(doc.querySelector('textarea')!.value).toBe('');
  });
});


it('invalidates configured sync when the current document changes on the same origin', async () => {
  const initial = document.implementation.createHTMLDocument();let doc=initial;
  const url = new URL('https://clinic.vettersoftware.com/schedule');
  const context=():AdapterContext=>({doc,url,localStorage:{getItem:()=> 'token'} as unknown as Storage,sessionStorage,fetch:vi.fn(),wait:async()=>{}});
  const {daysmart}=await import('./daysmart');
  const bridge=createPageBridge(()=>daysmart,context);
  const opened=await bridge.providerSync({operation:'open',identity:{provider:'daysmart',origin:url.origin,tenant_id:'Clinic',connection_revision:1},userConfirmed:true});
  expect(opened.ok).toBe(true);
  if(!opened.ok||opened.operation!=='open')return;
  doc=document.implementation.createHTMLDocument();
  expect(await bridge.providerSync({operation:'identity',session:opened.session})).toEqual({ok:false,code:'unavailable'});
});


describe('note autofill bridge lifetime', () => {
  it.each(['document', 'url', 'provider'])('invalidates a ticket permanently after an observed %s switch and restoration', async change => {
    const originalDoc = document.implementation.createHTMLDocument('Clinical note');
    originalDoc.body.innerHTML = '<div id="sectionContainer"><div id="Assessment"><div class="ql-editor" contenteditable="true"><p>Existing note</p></div></div></div>';
    let doc = originalDoc;
    const originalUrl = new URL('https://clinic.vetspire.com/notes');
    let url = originalUrl;
    const storage = { getItem: (key: string) => key === 'authToken' ? 'token' : key === '__pref-location' ? 'location' : null } as Storage;
    let provider: PimsAdapter['id'] = 'vetspire';
    const adapter = (): PimsAdapter => ({ id: provider, status: () => ({ state: 'notConsult', patientName: null, patientNumber: null, consult: null }) } as unknown as PimsAdapter);
    const context = (): AdapterContext => ({ doc, url, currentUrl: () => url, localStorage: storage, sessionStorage, fetch: vi.fn(), wait: async () => undefined });
    const bridge = createPageBridge(adapter, context);
    const prepared = await bridge.noteAutofill({ operation: 'prepare', field: 'Assessment' });
    expect(prepared.state).toBe('prepared');
    if (prepared.state !== 'prepared') return;
    if (change === 'document') doc = document.implementation.createHTMLDocument();
    if (change === 'url') url = new URL('https://clinic.vetspire.com/other');
    if (change === 'provider') provider = 'pulse';
    bridge.status();
    doc = originalDoc; url = originalUrl; provider = 'vetspire';
    expect(await bridge.noteAutofill({ operation: 'fill', ticket: prepared.ticket, text: 'Reviewed note' })).toEqual({ state: 'blocked' });
    expect(doc.querySelector('.ql-editor')!.textContent).toBe('Existing note');
  });
});

it('starts a fresh note source only after an explicit inspect following a session change',async()=>{
 const doc=document.implementation.createHTMLDocument('Clinical note');doc.body.innerHTML='<div id="sectionContainer"><div id="Assessment"><div class="ql-editor" contenteditable="true">Existing</div></div></div>';
 let token='first';const storage={getItem:(key:string)=>key==='authToken'?token:key==='__pref-location'?'location':null} as Storage;
 const url=new URL('https://clinic.vetspire.com/notes');
 const context:AdapterContext={doc,url,currentUrl:()=>url,localStorage:storage,sessionStorage,fetch:vi.fn(),wait:async()=>{}};
 const bridge=createPageBridge(()=>({id:'vetspire'} as PimsAdapter),()=>context);
 const old=await bridge.noteAutofill({operation:'prepare',field:'Assessment'});expect(old.state).toBe('prepared');if(old.state!=='prepared')return;
 token='second';expect(await bridge.noteAutofill({operation:'fill',ticket:old.ticket,text:'Old note'})).toEqual({state:'blocked'});
 expect(await bridge.noteAutofill({operation:'inspect'})).toMatchObject({state:'fields',fields:['Assessment']});
 const fresh=await bridge.noteAutofill({operation:'prepare',field:'Assessment'});expect(fresh.state).toBe('prepared');if(fresh.state!=='prepared')return;
 expect(await bridge.noteAutofill({operation:'fill',ticket:old.ticket,text:'Replay'})).toEqual({state:'blocked'});
 expect(await bridge.noteAutofill({operation:'fill',ticket:fresh.ticket,text:'Fresh reviewed note'})).toEqual({state:'filled'});
});
it('makes an in-flight note fill unknown when a fresh inspect disposes its source',async()=>{
 const doc=document.implementation.createHTMLDocument('Clinical note');doc.body.innerHTML='<div id="sectionContainer"><div id="Assessment"><div class="ql-editor" contenteditable="true">Existing</div></div></div>';
 const storage={getItem:(key:string)=>key==='authToken'?'token':key==='__pref-location'?'location':null} as Storage;
 const url=new URL('https://clinic.vetspire.com/notes');let settle!:()=>void;
 const context:AdapterContext={doc,url,currentUrl:()=>url,localStorage:storage,sessionStorage,fetch:vi.fn(),wait:()=>new Promise<void>(done=>{settle=done;})};
 const bridge=createPageBridge(()=>({id:'vetspire'} as PimsAdapter),()=>context);
 const ready=await bridge.noteAutofill({operation:'prepare',field:'Assessment'});if(ready.state!=='prepared')throw new TypeError();
 const pending=bridge.noteAutofill({operation:'fill',ticket:ready.ticket,text:'Append once'});
 await bridge.noteAutofill({operation:'inspect'});settle();expect(await pending).toEqual({state:'unknown'});
 expect(doc.querySelector('.ql-editor')!.textContent).toBe('ExistingAppend once');
});
