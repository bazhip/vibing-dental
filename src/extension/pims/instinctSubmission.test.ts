import { afterEach, expect, it, vi } from 'vitest';
import { createInstinctSubmission, isInstinctSubmissionRequest, isInstinctSubmissionResult, type InstinctSubmissionRequest } from './instinctSubmission';
import type { AdapterContext } from './types';

afterEach(() => vi.restoreAllMocks());

function fixture() {
  let state = JSON.stringify({ value: { accessToken: 'secret', practice: { id: 'clinic', apiUrl: 'https://api.instinctvet.com/graphql' } } });
  const storage = { getItem: vi.fn(() => state) } as unknown as Storage;
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ data: { uploadChartFile: { id: 'file' } } }) }) as Response);
  const context: AdapterContext = { doc: document, url: new URL('https://clinic.instinctvet.cloud/#/patient/123/charts/documents'),
    sessionStorage: storage, localStorage: storage, fetch: fetcher, wait: async () => {} };
  const provider = createInstinctSubmission(context);
  const prepare = async () => {
    const prepared = await provider.execute({ operation: 'prepare' });
    if (prepared.state !== 'prepared') throw new TypeError();
    const request: Extract<InstinctSubmissionRequest, { operation: 'submit' }> = { operation: 'submit', ticket: prepared.ticket,
      id: 'attempt', expires_at: prepared.expires_at, location_id: prepared.location_id, source: { chartId: 'chart', draftId: 'draft', version: 1 },
      bytes: Array.from(new TextEncoder().encode('%PDF-1.7\nfixture')), label: 'Reviewed history', recorded_at: '2026-11-17T00:00:00Z' };
    return { prepared, request };
  };
  return { provider, context, fetcher, prepare, setState: (value: string) => { state = value; } };
}

it('prepares a credential-free target and labels the literal location as a compatibility default', async () => {
  const { prepare, fetcher } = fixture();
  const { prepared } = await prepare();
  expect(prepared).toEqual({ state: 'prepared', ticket: expect.any(String), patient_id: '123', location_id: '1',
    location_source: 'compatibility_default', origin: 'https://clinic.instinctvet.cloud', expires_at: expect.any(String) });
  expect(Date.parse(prepared.expires_at)).toBeGreaterThan(Date.now());
  expect(JSON.stringify(prepared)).not.toMatch(/secret|accessToken|apiUrl/);
  expect(fetcher).not.toHaveBeenCalled();
});

it('sends the recovered multipart contract with a reviewed location and private ToothOps defaults', async () => {
  const { provider, prepare, fetcher } = fixture();
  const { request } = await prepare();
  expect(await provider.execute({ ...request, location_id: '2' })).toEqual({ state: 'submitted', id: 'attempt', file_id: 'file' });
  const [endpoint, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(endpoint).toBe('https://api.instinctvet.com/graphql');
  expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', headers: { authorization: 'Bearer secret' } });
  const body = init.body as FormData;
  expect(String(body.get('query'))).toContain('uploadChartFile(params: $params)');
  expect(JSON.parse(String(body.get('variables')))).toEqual({ params: { visitId: null, patientId: '123', locationId: '2',
    source: 'ToothOps', file: 'p.a.r.a.m.s.file', label: request.label, type: 'MEDICAL', contentType: 'application/pdf', recordedAt: request.recorded_at, isShared: false } });
  const file = body.get('p.a.r.a.m.s.file') as File;
  expect(file.type).toBe('application/pdf');
  expect(file.size).toBe(request.bytes.length);
  expect(Array.from(body.keys())).toEqual(['query', 'variables', 'p.a.r.a.m.s.file']);
});

it('allows sharing only when explicitly reviewed as a boolean', async () => {
  const { provider, prepare, fetcher } = fixture();
  const { request } = await prepare();
  expect((await provider.execute({ ...request, is_shared: true })).state).toBe('submitted');
  const init = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
  expect(JSON.parse(String((init.body as FormData).get('variables'))).params.isShared).toBe(true);
});

it('acknowledges without claiming persisted confirmation when no response ID is available', async () => {
  const { provider, prepare, fetcher } = fixture();
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ data: { uploadChartFile: {} } }) } as Response);
  expect(await provider.execute((await prepare()).request)).toEqual({ state: 'submitted', id: 'attempt' });
});

it.each(['network', 'http', 'json', 'graphql', 'null', 'primitive'])('keeps %s failures after dispatch unknown and never retries', async (failure) => {
  const { provider, prepare, fetcher } = fixture();
  const { request } = await prepare();
  if (failure === 'network') fetcher.mockRejectedValue(new TypeError());
  else fetcher.mockResolvedValue({ ok: failure !== 'http', json: async () => {
    if (failure === 'json') throw new TypeError();
    return failure === 'graphql' ? { errors: [{ message: 'private server details' }] } : failure === 'null' ? null : 42;
  } } as Response);
  expect(await provider.execute(request)).toEqual({ state: 'unknown', id: 'attempt' });
  expect(await provider.execute(request)).toEqual({ state: 'blocked' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(['patient', 'url', 'session', 'endpoint', 'practice', 'expiry'])('blocks changed %s before dispatch', async (change) => {
  const { provider, prepare, context, fetcher, setState } = fixture();
  const { request } = await prepare();
  if (change === 'patient') context.currentUrl = () => new URL('https://clinic.instinctvet.cloud/#/patient/456/charts/documents');
  if (change === 'url') context.currentUrl = () => new URL(`${context.url.href}?changed=1`);
  if (change === 'session') setState(JSON.stringify({ value: { accessToken: 'other', practice: { id: 'clinic', apiUrl: 'https://api.instinctvet.com/graphql' } } }));
  if (change === 'endpoint') setState(JSON.stringify({ value: { accessToken: 'secret', practice: { id: 'clinic', apiUrl: 'https://other.instinctvet.com/graphql' } } }));
  if (change === 'practice') setState(JSON.stringify({ value: { accessToken: 'secret', practice: { id: 'other', apiUrl: 'https://api.instinctvet.com/graphql' } } }));
  if (change === 'expiry') vi.spyOn(Date, 'now').mockReturnValue(Date.parse(request.expires_at));
  expect(await provider.execute(request)).toEqual({ state: 'blocked' });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(['https://evil.example/#/patient/123/charts', 'https://clinic.instinctvet.cloud/#/patient/123/profile',
  'https://clinic.instinctvet.cloud/#/patient/123/charts-evil', 'https://clinic.instinctvet.cloud/#/patient/%2F/charts',
  'https://clinic.instinctvet.cloud:444/#/patient/123/charts'])('blocks unsafe patient route %s', async (url) => {
  const { context, fetcher } = fixture();
  context.url = new URL(url);
  expect(await createInstinctSubmission(context).execute({ operation: 'prepare' })).toEqual({ state: 'blocked' });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(['https://evil.example/graphql', 'http://api.instinctvet.com/graphql', 'https://api.instinctvet.com:444/graphql',
  'https://api.instinctvet.com/graphql?token=secret', 'https://api.instinctvet.com/graphql#hash'])('blocks unsafe session endpoint %s', async (apiUrl) => {
  const { provider, setState } = fixture();
  setState(JSON.stringify({ value: { accessToken: 'secret', practice: { apiUrl } } }));
  expect(await provider.execute({ operation: 'prepare' })).toEqual({ state: 'blocked' });
});

it.each([null, {}, { operation: 'other' }, { operation: 'submit', ticket: 'forged' }])('blocks malformed wire request %j', async (request) => {
  const { provider, fetcher } = fixture();
  expect(await provider.execute(request as InstinctSubmissionRequest)).toEqual({ state: 'blocked' });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([{ bytes: [] }, { bytes: [37, 80, 68, 70, 45, 256] }, { bytes: [37, 80, 68, 70, 45, 1.2] },
  { bytes: new Uint8Array([37, 80, 68, 70, 45, 1]) }, { bytes: [1, 2, 3, 4, 5, 6] }, { label: '' }, { label: 'x'.repeat(201) },
  { recorded_at: 'invalid' }, { location_id: '' }, { id: '' }, { is_shared: 'true' }, { expires_at: '2099-01-01T00:00:00Z' }])('blocks invalid submission fields %j', async (patch) => {
  const { provider, prepare, fetcher } = fixture();
  const { request } = await prepare();
  expect(await provider.execute({ ...request, ...patch } as InstinctSubmissionRequest)).toEqual({ state: 'blocked' });
  expect(fetcher).not.toHaveBeenCalled();
});

it('bounds wire PDF bytes before copying or dispatching', async () => {
  const { provider, prepare, fetcher } = fixture();
  const { request } = await prepare();
  expect(await provider.execute({ ...request, bytes: new Array(2097153).fill(0) })).toEqual({ state: 'blocked' });
  expect(fetcher).not.toHaveBeenCalled();
});

it('consumes a ticket and submission ID before awaiting fetch', async () => {
  const { provider, prepare, fetcher } = fixture();
  const { request } = await prepare();
  const other = (await prepare()).request;
  const results = await Promise.all([provider.execute(request), provider.execute({ ...request, id: 'other' }), provider.execute(other)]);
  expect(results.map(result => result.state)).toEqual(['submitted', 'blocked', 'blocked']);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('does not transfer tickets between factories', async () => {
  const { prepare } = fixture();
  const other = fixture();
  expect(await other.provider.execute((await prepare()).request)).toEqual({ state: 'blocked' });
  expect(other.fetcher).not.toHaveBeenCalled();
});

it('blocks a repeated source version even with a new ticket and request ID', async () => {
  const { provider, prepare, fetcher } = fixture();
  const first = (await prepare()).request;
  const second = { ...(await prepare()).request, id: 'other' };
  expect((await provider.execute(first)).state).toBe('submitted');
  expect(await provider.execute(second)).toEqual({ state: 'blocked' });
  const third = { ...(await prepare()).request, id: 'third', source: { ...first.source, version: 2 } };
  expect((await provider.execute(third)).state).toBe('submitted');
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each([undefined, null, {}, { chartId: 'chart', draftId: 'draft', version: -1 },
  { chartId: 'chart', draftId: 'draft', version: 1.5 }, { chartId: '', draftId: 'draft', version: 1 }])('blocks invalid source metadata %j', async (source) => {
  const { provider, prepare, fetcher } = fixture();
  const { request } = await prepare();
  expect(isInstinctSubmissionRequest({ ...request, source })).toBe(false);
  expect(await provider.execute({ ...request, source } as InstinctSubmissionRequest)).toEqual({ state: 'blocked' });
  expect(fetcher).not.toHaveBeenCalled();
});

it('exports bridge guards for the wire request and result unions', async () => {
  const { provider, prepare } = fixture();
  const { prepared, request } = await prepare();
  expect(isInstinctSubmissionRequest({ operation: 'prepare' })).toBe(true);
  expect(isInstinctSubmissionRequest(request)).toBe(true);
  expect(isInstinctSubmissionRequest({ ...request, bytes: [37, 80, 68, 70, 45, , 1] })).toBe(false);
  expect(isInstinctSubmissionRequest({ ...request, bytes: new Uint8Array(request.bytes) })).toBe(false);
  expect(isInstinctSubmissionResult(prepared)).toBe(true);
  expect(isInstinctSubmissionResult(await provider.execute(request))).toBe(true);
  expect(isInstinctSubmissionResult({ state: 'submitted', id: 'attempt' })).toBe(true);
  expect(isInstinctSubmissionResult({ state: 'unknown', id: 'attempt' })).toBe(true);
  expect(isInstinctSubmissionResult({ state: 'blocked' })).toBe(true);
  for (const invalid of [null, {}, { state: 'confirmed' }, { state: 'submitted' }, { state: 'unknown', id: '' },
    { ...prepared, location_source: 'observed' }, { ...prepared, origin: 'https://evil.example' }, { ...prepared, expires_at: 'invalid' }]) {
    expect(isInstinctSubmissionResult(invalid)).toBe(false);
  }
});

it('returns unknown when page identity changes while dispatch is in flight', async () => {
  const { provider, prepare, fetcher, context } = fixture();
  fetcher.mockImplementation(async () => {
    context.currentUrl = () => new URL('https://clinic.instinctvet.cloud/#/patient/456/charts/documents');
    return { ok: true, json: async () => ({ data: { uploadChartFile: { id: 'file' } } }) } as Response;
  });
  expect(await provider.execute((await prepare()).request)).toEqual({ state: 'unknown', id: 'attempt' });
});


it.each([{}, { data: {} }, { errors: [] }, { data: { otherMutation: {} } }, { data: { uploadChartFile: null } }])('does not acknowledge missing upload mutation result %j', async response => {
  const { provider, prepare, fetcher } = fixture();
  fetcher.mockResolvedValue({ ok: true, json: async () => response } as Response);
  const { request } = await prepare();
  expect(await provider.execute(request)).toEqual({ state: 'unknown', id: 'attempt' });
  expect(await provider.execute({ ...request, id: 'retry' })).toEqual({ state: 'blocked' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
