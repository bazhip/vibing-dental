import { afterEach, expect, it, vi } from 'vitest';
import proxy from '../../api/drug-reference.mjs';

afterEach(() => vi.unstubAllGlobals());

async function send(url: string) {
  const response = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
  await proxy({ method: 'GET', url, headers: { cookie: 'private-session' } }, response);
  return response;
}

it('searches only veterinary label categories and forwards no incoming headers', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ data: [] })));
  vi.stubGlobal('fetch', fetch);
  expect((await send('/?q=carprofen')).statusCode).toBe(200);
  expect(fetch.mock.calls).toHaveLength(2);
  for (const [request, config] of fetch.mock.calls as unknown as [URL, RequestInit][]) {
    expect(request.hostname).toBe('dailymed.nlm.nih.gov');
    expect(request.searchParams.get('drug_name')).toBe('carprofen');
    expect(request.searchParams.get('doctype')).toMatch(/^5057[78]-[46]$/);
    expect(config.headers).toBeUndefined();
  }
});

it('rejects arbitrary remote URLs and incorrect identifiers before calling upstream', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect((await send('/?q=https://example.test')).statusCode).toBe(400);
  expect((await send('/?label=../spls.json')).statusCode).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
