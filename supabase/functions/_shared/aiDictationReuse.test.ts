import { createDictationRequestReuse, reviewSystemCache } from './aiDictationReuse';

const requestText = '{"messages":[{"role":"user","content":"104 mobility 2"}],"kind":"live"}';
const first = { userId: 'account-a', practiceId: 'practice-a', model: 'claude-haiku-5-5', raw: requestText };
const response = (text: string, status = 200) => new Response(text, { status });

it('shares the in-flight call and lets each caller read the full response', async () => {
  const reuse = createDictationRequestReuse();
  let calls = 0;
  let resolve: (value: Response) => void = () => {};
  const upstream = new Promise<Response>(done => { resolve = done; });
  const run = () => { calls++; return upstream; };
  const requests = [reuse(first, run), reuse(first, run)];
  resolve(response('chart actions'));
  const copies = await Promise.all(requests);
  expect(await Promise.all(copies.map(copy => copy.text()))).toEqual(['chart actions', 'chart actions']);
  expect(calls).toBe(1);
  expect(await (await reuse(first, run)).text()).toBe('chart actions');
  expect(calls).toBe(1);
});

it.each([
  ['account', { userId: 'account-b' }],
  ['practice', { practiceId: 'practice-b' }],
  ['model', { model: 'claude-sonnet-5-5' }],
  ['payload', { raw: requestText.replace('mobility 2', 'mobility 3') }],
])('runs a new provider request when the %s changes', async (_label, change) => {
  const reuse = createDictationRequestReuse();
  expect(await (await reuse(first, async () => response('first'))).text()).toBe('first');
  expect(await (await reuse({ ...first, ...change }, async () => response('second'))).text()).toBe('second');
});

it('does not replay an unsuccessful response', async () => {
  const reuse = createDictationRequestReuse();
  expect((await reuse(first, async () => response('too busy', 429))).status).toBe(429);
  expect(await (await reuse(first, async () => response('chart actions'))).text()).toBe('chart actions');
});

it('does not replay a successful response after its retention window', async () => {
  const reuse = createDictationRequestReuse(10);
  await reuse(first, async () => response('old'));
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(await (await reuse(first, async () => response('new'))).text()).toBe('new');
});

it('forwards the same text with a longer cache only at the review system breakpoint', () => {
  const system = [{ type: 'text', text: 'stable chart rules', cache_control: { type: 'ephemeral' } }];
  expect(reviewSystemCache(system, true)).toEqual([
    { type: 'text', text: 'stable chart rules', cache_control: { type: 'ephemeral', ttl: '1h' } },
  ]);
  expect(reviewSystemCache(system, false)).toBe(system);
  expect(system[0].cache_control).toEqual({ type: 'ephemeral' });
  expect(reviewSystemCache('plain string', true)).toBe('plain string');
});
