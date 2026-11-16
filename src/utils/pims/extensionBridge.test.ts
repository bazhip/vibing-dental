import { vi } from 'vitest';

const native = vi.hoisted(() => vi.fn(() => false));
vi.mock('../../native/platform', () => ({ isNativeApp: native }));

import { extensionAvailable, ping, inspect, send, diagnose, appointments, startChart, takePendingPatient, EXTENSION_ID } from './extensionBridge';
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
  it('ping retries once', async () => {
    sendMessage.mockImplementationOnce(neverAnswers).mockImplementationOnce(answer({ version: '1.0.0' }));
    const p = ping();
    await vi.advanceTimersByTimeAsync(500);
    expect(await p).toEqual({ version: '1.0.0' });
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
    cb({ version: '1.0.0' });
    expect(await p).toEqual({ version: '1.0.0' });
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
