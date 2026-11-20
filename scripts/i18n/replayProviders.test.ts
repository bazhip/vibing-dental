// @vitest-environment node
import type { AutofillRequest } from '../../src/utils/aiAutofill';
import { createReplayCaller, replayCost, type ReplayUsage } from './replayProviders';

const base: AutofillRequest = {
  kind: 'live',
  max_tokens: 1024,
  system: [{ type: 'text', text: 'charting rules', cache_control: { type: 'ephemeral' } }],
  messages: [{ role: 'user', content: [{ type: 'text', text: '104 fractured' }] }],
  tools: [{ name: 'set_tooth_mark', description: 'Mark a tooth', input_schema: { type: 'object' } }],
};
const env = {
  DASHSCOPE_API_KEY: 'fake-qwen-key',
  DASHSCOPE_ANTHROPIC_BASE_URL: 'https://test.us-east-1.maas.aliyuncs.com/apps/anthropic',
  OPENAI_API_KEY: 'fake-openai-key',
  ANTHROPIC_API_KEY: 'fake-claude-key',
};
const tool = { type: 'tool_use', name: 'set_tooth_mark', input: { triadan: 104 } };

it('sends the unchanged charting prompt and tools to Qwen Messages', async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    content: [tool], usage: { input_tokens: 200, cache_read_input_tokens: 1000, cache_creation_input_tokens: 800, output_tokens: 60 },
  }));
  const result = await createReplayCaller('qwen3.7-flash', env, send)(base);
  const [url, options] = send.mock.calls[0];
  expect(String(url)).toBe('https://test.us-east-1.maas.aliyuncs.com/apps/anthropic/v1/messages');
  expect(new Headers(options?.headers).get('x-api-key')).toBe(env.DASHSCOPE_API_KEY);
  expect(JSON.parse(String(options?.body))).toEqual({
    model: 'qwen3.7-flash', max_tokens: 4096, system: base.system, tools: base.tools, messages: base.messages,
    thinking: { type: 'disabled' },
  });
  expect(result).toMatchObject({ content: [tool], usage: { input: 200, cacheRead: 1000, cacheWrite: 800, output: 60 } });
});

it('translates Luna final review tools and token usage to replay format', async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    status: 'completed',
    output: [{ type: 'reasoning' }, { type: 'function_call', name: tool.name, arguments: '{"triadan":104}' }],
    usage: { input_tokens: 2000, input_tokens_details: { cached_tokens: 1000, cache_write_tokens: 800 }, output_tokens: 60 },
  }));
  const result = await createReplayCaller('gpt-6-luna', env, send)({ ...base, mode: 'review', kind: 'review' });
  const [url, options] = send.mock.calls[0];
  expect(String(url)).toBe('https://api.openai.com/v1/responses');
  expect(new Headers(options?.headers).get('authorization')).toBe('Bearer fake-openai-key');
  expect(JSON.parse(String(options?.body))).toEqual({
    model: 'gpt-6-luna', max_output_tokens: 16_000, store: false,
    reasoning: { effort: 'medium' }, instructions: 'charting rules',
    input: [{ role: 'user', content: '104 fractured' }],
    tools: [{ type: 'function', name: 'set_tooth_mark', description: 'Mark a tooth', parameters: { type: 'object' }, strict: false }],
  });
  expect(result).toMatchObject({ content: [tool], usage: { input: 200, cacheRead: 1000, cacheWrite: 800, output: 60 } });
});

it('rejects a missing Qwen key before any transcript can be sent', () => {
  expect(() => createReplayCaller('qwen3.7-flash', {})).toThrow('DASHSCOPE_API_KEY');
});

it('prices cached reads, writes and output separately for a replay request', () => {
  const usage: ReplayUsage = { input: 1000, cacheRead: 9000, cacheWrite: 2000, output: 50 };
  expect(replayCost('gpt-6-luna', usage)).toBeCloseTo(0.000465, 9);
  expect(replayCost('claude-sonnet-5-5', usage)).toBeCloseTo(0.0084, 9);
});

it('prices longer Qwen reviews at the matching console tier', () => {
  const usage: ReplayUsage = { input: 40_000, cacheRead: 9000, cacheWrite: 2000, output: 50 };
  expect(replayCost('qwen3.7-flash', usage)).toBeCloseTo(0.00436, 9);
});

it('keeps Claude custom headers out of Qwen requests', async () => {
  vi.stubEnv('ANTHROPIC_CUSTOM_HEADERS', 'X-Claude-Routing-Token: private');
  try {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      content: [], usage: { input_tokens: 200, output_tokens: 0 },
    }));
    await createReplayCaller('qwen3.7-flash', env, send)(base);
    expect(new Headers(send.mock.calls[0][1]?.headers).has('x-claude-routing-token')).toBe(false);
  } finally {
    vi.unstubAllEnvs();
  }
});

it('reports a provider error when an incomplete Luna response omits token usage', async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [], usage: null,
  }));
  await expect(createReplayCaller('gpt-6-luna', env, send)(base))
    .rejects.toThrow('OpenAI replay incomplete response omitted token usage');
});
