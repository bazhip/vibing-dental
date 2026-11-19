import { vi } from 'vitest';

const native = vi.hoisted(() => vi.fn(() => false));
vi.mock('../../native/platform', () => ({ isNativeApp: native }));

import { createTransport, extensionAvailable, ping, inspect, send, diagnose, appointments, startChart, takePendingPatient, EXTENSION_ID } from './extensionBridge';
import type { PhysicalExamRequest } from '../../extension/pims/types';
import i18n from '../../i18n';
import { LocalizedError } from '../apiErrors';

type Cb = (response?: unknown) => void;
const sendMessage = vi.fn<(id: string, msg: unknown, cb: Cb) => void>();
const runtime: { sendMessage: typeof sendMessage; lastError?: { message: string } } = { sendMessage };

const answer = (value: unknown) => (_id: string, _m: unknown, cb: Cb) => cb(value);
const lastError = (message: string) => (_id: string, _m: unknown, cb: Cb) => {
  runtime.lastError = { message };
  cb(undefined);
  runtime.lastError = undefined;
};
const neverAnswers = () => {};

describe('explicit physical exam transport', () => {
  const target = { provider: 'shepherd' as const, consult: { recordId: '12345678-1234-1234-1234-123456789abc', viewId: 'objective' } };
  const request: PhysicalExamRequest = { operation: 'open', target, pageId: 'page', ticket: 'ticket', templateId: 'template' };
  it('pins the tab and action without retrying an unknown creation timeout', async () => {
    const channel = { sendMessage: vi.fn() };
    const transport = createTransport(() => channel);
    const pending = transport.physicalExam!(7, request);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toEqual({ ok: false, code: 'physical_exam_outcome_unknown' });
    expect(channel.sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'physicalExam', tabId: 7, request }, expect.any(Function));
  });
  it.each([undefined, { ok: true, state: 'saved' }, { ok: true, state: 'opened', recordId: 'another', examId: '123' }])('fails closed on a missing or malformed opening response: %j', async response => {
    const transport = createTransport(() => ({ sendMessage: (_message, callback) => callback(response) }));
    expect(await transport.physicalExam!(7, request)).toEqual({ ok: false, code: 'physical_exam_outcome_unknown' });
  });
  it('rejects stale prepare replies, keeping read-only failures distinct from unknown opening', async () => {
    const transport = createTransport(() => ({ sendMessage: (_message, callback) => callback({ ok: true, state: 'prepared', pageId: 'other', ticket: 'ticket', doctor: 'Doctor', templates: [{ id: 'id', label: 'Dental' }] }) }));
    expect(await transport.physicalExam!(7, { operation: 'prepare', target, pageId: 'page' })).toEqual({ ok: false, code: 'unavailable' });
  });
});

beforeEach(() => {
  vi.useFakeTimers();
  sendMessage.mockReset();
  native.mockReturnValue(false);
  runtime.lastError = undefined;
  vi.stubGlobal('chrome', { runtime });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('extensionBridge', () => {
  it.each([
    { version: '1.0.0' },
    { version: '1.0.0', protocol: 2, capabilities: ['inspect', 'send', 'diagnose'] },
    { version: '1.0.0', protocol: 1, capabilities: ['inspect'] },
    { version: '', protocol: 1, capabilities: ['inspect', 'send', 'diagnose'] },
    'unexpected',
  ])('refuses an incompatible handshake: %j', async (response) => {
    sendMessage.mockImplementation(answer(response));
    expect(await ping()).toBeNull();
  });
  it('ping retries once', async () => {
    sendMessage.mockImplementationOnce(neverAnswers).mockImplementationOnce(answer({ version: '1.0.0', protocol: 1, capabilities: ['inspect', 'send', 'diagnose'] }));
    const p = ping();
    await vi.advanceTimersByTimeAsync(500);
    expect(await p).toEqual({ version: '1.0.0', protocol: 1, capabilities: ['inspect', 'send', 'diagnose'] });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[0][0]).toBe(EXTENSION_ID);
  });

  it('ping null when not installed, after exactly one retry', async () => {
    sendMessage.mockImplementation(lastError('Could not establish connection'));
    expect(await ping()).toBeNull();
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('ping null when it never answers, after 500 ms then 1.5 s', async () => {
    sendMessage.mockImplementation(neverAnswers);
    let settled = false;
    const p = ping().then((v) => { settled = true; return v; });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toBeNull();
  });

  it('the second ping waits for a cold service worker', async () => {
    let cb!: Cb;
    sendMessage.mockImplementationOnce(neverAnswers).mockImplementationOnce((_id, _m, c) => { cb = c; });
    const p = ping();
    await vi.advanceTimersByTimeAsync(500 + 1_200);
    cb({ version: '1.0.0', protocol: 1, capabilities: ['inspect', 'send', 'diagnose'] });
    expect(await p).toEqual({ version: '1.0.0', protocol: 1, capabilities: ['inspect', 'send', 'diagnose'] });
  });

  it('unavailable in native app, and without chrome.runtime', () => {
    expect(extensionAvailable()).toBe(true);
    native.mockReturnValue(true);
    expect(extensionAvailable()).toBe(false);
    native.mockReturnValue(false);
    vi.stubGlobal('chrome', undefined);
    expect(extensionAvailable()).toBe(false);
  });

  it('inspect returns the reply', async () => {
    const reply = { tab: null, candidates: 0, status: null, fields: [] };
    sendMessage.mockImplementation(answer(reply));
    expect(await inspect()).toEqual(reply);
  });

  it('inspect times out after 5 s with a LocalizedError', async () => {
    sendMessage.mockImplementation(neverAnswers);
    const p = inspect().catch((e) => e);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await p).toBeInstanceOf(LocalizedError);
  });

  it('lastError rejects with a LocalizedError', async () => {
    sendMessage.mockImplementation(lastError('boom'));
    await expect(inspect()).rejects.toBeInstanceOf(LocalizedError);
  });

  it('send waits up to 120 s and returns { ok:false } as-is', async () => {
    sendMessage.mockImplementation(neverAnswers);
    const slow = send({ type: 'send', tabId: 1, expectedPatient: 'Rex', confirmedEzyvetPatient: null, expectedConsult: null, items: [] }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(119_000);
    sendMessage.mockImplementation(answer({ ok: false, code: 'patient_changed' }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(await slow).toBeInstanceOf(LocalizedError);

    const fast = await send({ type: 'send', tabId: 1, expectedPatient: 'Rex', confirmedEzyvetPatient: null, expectedConsult: null, items: [] });
    expect(fast).toEqual({ ok: false, code: 'patient_changed' });
  });

  it('diagnose returns the diagnostics and the last send codes', async () => {
    sendMessage.mockImplementation(answer({ diagnostics: null, lastCodes: ['editor_not_found'] }));
    expect(await diagnose(3)).toEqual({ diagnostics: null, lastCodes: ['editor_not_found'] });
    expect(sendMessage.mock.calls[0][1]).toEqual({ type: 'diagnose', tabId: 3 });
  });
  it('appointments sends the exact request and times out after 30 s with the timeout message', async () => {
    sendMessage.mockImplementation(answer({ tab: null, result: null }));
    expect(await appointments('2026-11-16', false)).toEqual({ tab: null, result: null });
    expect(sendMessage.mock.calls[0][1]).toEqual({ type: 'appointments', date: '2026-11-16', navigate: false });

    sendMessage.mockImplementation(neverAnswers);
    const slow = appointments('2026-11-16', true).catch((e) => e);
    await vi.advanceTimersByTimeAsync(30_000);
    const err = await slow;
    expect(err).toBeInstanceOf(LocalizedError);
    expect((err as Error).message).toBe(i18n.t('pims:errors.timeout'));
  });

  it('startChart sends the handover', async () => {
    const handover = { userId: 'u', patientName: 'Rex', patientNumber: '1', ownerName: 'Al', latestChartId: null };
    sendMessage.mockImplementation(answer({ ok: true }));
    expect(await startChart(handover)).toEqual({ ok: true });
    expect(sendMessage.mock.calls[0][1]).toEqual({ type: 'startChart', handover });
  });

  it('takePendingPatient is null after a lastError reply, without retrying', async () => {
    sendMessage.mockImplementation(lastError('Unknown request'));
    expect(await takePendingPatient()).toBeNull();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][1]).toEqual({ type: 'takePendingPatient' });
  });

  it('takePendingPatient returns the answer', async () => {
    sendMessage.mockImplementation(answer({ handover: null }));
    expect(await takePendingPatient()).toEqual({ handover: null });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('takePendingPatient asks once and waits 5 s (a retry could find the entry already taken)', async () => {
    sendMessage.mockImplementation(neverAnswers);
    let settled = false;
    const p = takePendingPatient().then((v) => { settled = true; return v; });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toBeNull();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});


describe('Instinct submission transport', () => {
  const request = { operation: 'submit' as const, ticket: 'ticket', id: 'attempt', expires_at: '2099-01-01T00:00:00Z',
    bytes: [37,80,68,70,45,1], label: 'Record', recorded_at: '2026-11-17T00:00:00Z', location_id: '1',
    source: { chartId: 'chart', draftId: 'draft', version: 1 } };
  it('pins the tab and sends once; timeout is an unknown outcome', async () => {
    const channel = { sendMessage: vi.fn() };
    const transport = createTransport(() => channel);
    const pending = transport.instinctSubmission!(7, request);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await pending).toEqual({ state: 'unknown', id: 'attempt' });
    expect(channel.sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'instinctSubmission', tabId: 7, request }, expect.any(Function));
  });
  it.each([undefined, { state: 'prepared', ticket: 't' }, { state: 'submitted', id: 'another' }, { state: 'unknown', id: 'another' }])('rejects malformed or wrong-operation replies: %j', async response => {
    const transport = createTransport(() => ({ sendMessage: (_message, callback) => callback(response) }));
    expect(await transport.instinctSubmission!(7, request)).toEqual({ state: 'unknown', id: 'attempt' });
  });
  it('blocks invalid tab and malformed input before messaging', async () => {
    const channel = { sendMessage: vi.fn() };
    const transport = createTransport(() => channel);
    expect(await transport.instinctSubmission!(-1, request)).toEqual({ state: 'blocked' });
    expect(await transport.instinctSubmission!(7, { ...request, bytes: [] })).toEqual({ state: 'blocked' });
    expect(channel.sendMessage).not.toHaveBeenCalled();
  });
  it('accepts prepared replies only for prepare and treats missing extension as blocked', async () => {
    const prepared = { state: 'prepared', ticket: 't', patient_id: 'p', location_id: '1', location_source: 'compatibility_default', origin: 'https://app.instinctvet.com', expires_at: '2099-01-01T00:00:00Z' };
    const transport = createTransport(() => ({ sendMessage: (_message, callback) => callback(prepared) }));
    expect(await transport.instinctSubmission!(7, { operation: 'prepare' })).toEqual(prepared);
    expect(await createTransport(() => undefined).instinctSubmission!(7, { operation: 'prepare' })).toEqual({ state: 'blocked' });
  });
});

describe('radiology autofill transport', () => {
  it('pins messages and never retries a lost fill reply', async () => {
    const channel = { sendMessage: vi.fn() };
    const transport = createTransport(() => channel);
    const request = { operation: 'fill' as const, tabId: 9, ticket: 'one', text: 'Radiology findings' };
    const pending = transport.radiologyAutofill!(request);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toEqual({ state: 'unknown' });
    expect(channel.sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'radiologyAutofill', request }, expect.any(Function));
  });
  it('rejects malformed and wrong-phase replies and allows bounded target lists', async () => {
    const channel = { sendMessage: vi.fn((_message: unknown, callback: Cb) => callback({ state: 'filled' })) };
    const transport = createTransport(() => channel);
    expect(await transport.radiologyAutofill!({ operation: 'prepare', tabId: 1 })).toEqual({ state: 'blocked' });
    channel.sendMessage.mockImplementation((_message, callback) => callback({ state: 'targets', targets: [] }));
    expect(await transport.radiologyAutofill!({ operation: 'list' })).toEqual({ state: 'targets', targets: [] });
    expect(await transport.radiologyAutofill!({ operation: 'fill', tabId: 1, ticket: 'one', text: 'Findings' })).toEqual({ state: 'unknown' });
  });
});


describe('note autofill transport', () => {
  it('pins messages and never retries a lost fill reply', async () => {
    const channel = { sendMessage: vi.fn() };
    const transport = createTransport(() => channel);
    const request = { operation: 'fill' as const, tabId: 9, ticket: 'one', text: 'Reviewed notes' };
    const pending = transport.noteAutofill!(request);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toEqual({ state: 'unknown' });
    expect(channel.sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'noteAutofill', request }, expect.any(Function));
  });
  it('validates reply phases and preserves read-only blocked results', async () => {
    let response: unknown = { state: 'filled' };
    const transport = createTransport(() => ({ sendMessage: (_message, callback) => callback(response) }));
    expect(await transport.noteAutofill!({ operation: 'inspect', tabId: 1 })).toEqual({ state: 'blocked' });
    response = { state: 'targets', targets: [] };
    expect(await transport.noteAutofill!({ operation: 'list' })).toEqual(response);
    expect(await transport.noteAutofill!({ operation: 'fill', tabId: 1, ticket: 'one', text: 'Notes' })).toEqual({ state: 'unknown' });
    response = { state: 'blocked' };
    expect(await transport.noteAutofill!({ operation: 'fill', tabId: 1, ticket: 'one', text: 'Notes' })).toEqual(response);
  });
});
