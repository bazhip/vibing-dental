import { vi } from 'vitest';
import { internalTransport } from './internalTransport';
import { LocalizedError } from '../../utils/apiErrors';

type Cb = (response?: unknown) => void;
const sendMessage = vi.fn<(msg: unknown, cb: Cb) => void>();
const runtime: { id: string; sendMessage: typeof sendMessage; lastError?: { message: string } } = { id: 'x', sendMessage };

beforeEach(() => {
  vi.useFakeTimers();
  sendMessage.mockReset();
  runtime.lastError = undefined;
  vi.stubGlobal('chrome', { runtime });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('internalTransport', () => {
  it('messages the own background without an extension id', async () => {
    sendMessage.mockImplementation((_m, cb) => cb({ version: '1.2.3', protocol: 1, capabilities: ['inspect', 'send', 'diagnose'] }));
    expect(await internalTransport.ping()).toEqual({ version: '1.2.3', protocol: 1, capabilities: ['inspect', 'send', 'diagnose'] });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'ping' }, expect.any(Function));
  });

  it('inspect times out after 5 s like the external bridge', async () => {
    sendMessage.mockImplementation(() => {});
    const p = internalTransport.inspect().catch((e) => e);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await p).toBeInstanceOf(LocalizedError);
  });

  it('lastError rejects with a LocalizedError', async () => {
    sendMessage.mockImplementation((_m, cb) => {
      runtime.lastError = { message: 'Receiving end does not exist.' };
      cb(undefined);
      runtime.lastError = undefined;
    });
    await expect(internalTransport.inspect()).rejects.toBeInstanceOf(LocalizedError);
  });

  it('no chrome.runtime: unavailable', async () => {
    vi.stubGlobal('chrome', undefined);
    await expect(internalTransport.inspect()).rejects.toBeInstanceOf(LocalizedError);
  });
});
