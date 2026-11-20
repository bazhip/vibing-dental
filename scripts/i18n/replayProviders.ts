import Anthropic from '@anthropic-ai/sdk';
import type { AutofillRequest } from '../../src/utils/aiAutofill';

// These Claude settings mirror ai-autofill. Qwen preserves the Messages
// prompt and tools through Model Studio's Anthropic-compatible endpoint.
const LIVE: Record<string, Record<string, unknown>> = {
  'claude-opus-5-5': { output_config: { effort: 'low' } },
  'claude-sonnet-5-5': { thinking: { type: 'between_tools' } },
  'claude-haiku-5-5': { output_config: { effort: 'low' } },
};
const REVIEW: Record<string, Record<string, unknown>> = {
  'claude-opus-5-5': { output_config: { effort: 'medium' } },
  'claude-sonnet-5-5': { output_config: { effort: 'medium' } },
  'claude-haiku-5-5': { output_config: { effort: 'medium' } },
  'claude-opus-4-8': { thinking: { type: 'adaptive' }, output_config: { effort: 'medium' } },
};

export interface ReplayUsage {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

interface ReplayResponse {
  content: Array<{ type: string; name?: string; input?: unknown }>;
  usage: ReplayUsage;
  warning?: string;
}

export type ReplayCaller = (request: AutofillRequest) => Promise<ReplayResponse>;

const QWEN_FLASH = 'qwen3.7-flash';
const LUNA = 'gpt-6-luna';

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Set ${key} to use this replay provider.`);
  return value;
}

function modelStudioURL(env: NodeJS.ProcessEnv): string {
  const url = new URL(required(env, 'DASHSCOPE_ANTHROPIC_BASE_URL'));
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.maas.aliyuncs.com')
      || url.username || url.password || url.search || url.hash || !/^\/apps\/anthropic\/?$/.test(url.pathname)) {
    throw new Error('DASHSCOPE_ANTHROPIC_BASE_URL must be a workspace Model Studio HTTPS URL ending in /apps/anthropic.');
  }
  return url.href.replace(/\/$/, '');
}

function qwenMessages(env: NodeJS.ProcessEnv, send: typeof fetch) {
  const apiKey = required(env, 'DASHSCOPE_API_KEY');
  const url = `${modelStudioURL(env)}/v1/messages`;
  return async (body: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> => {
    const response = await send(url, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Qwen replay failed (HTTP ${response.status}).`);
    return await response.json() as Anthropic.Message;
  };
}

function messagesCaller(model: string, env: NodeJS.ProcessEnv, send: typeof fetch): ReplayCaller {
  const qwen = model === QWEN_FLASH;
  const client = qwen ? null : new Anthropic({ fetch: send });
  const createMessage = client
    ? (body: Anthropic.MessageCreateParamsNonStreaming) => client.messages.create(body)
    : qwenMessages(env, send);
  return async (request) => {
    const { mode, kind: _kind, ...body } = request;
    const review = mode === 'review';
    const settings = qwen
      ? { thinking: review ? { type: 'enabled', budget_tokens: 4096 } : { type: 'disabled' } }
      : (review ? REVIEW[model] : LIVE[model]);
    const response = await createMessage({
      ...body,
      model,
      max_tokens: review ? 16_000 : 4096,
      ...settings,
    } as Anthropic.MessageCreateParamsNonStreaming);
    const warning = response.stop_reason === 'max_tokens' ? 'hit max_tokens — output truncated'
      : response.stop_reason === 'refusal' ? 'refused' : undefined;
    return {
      content: response.content,
      usage: {
        input: response.usage.input_tokens ?? 0,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
        cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
        output: response.usage.output_tokens ?? 0,
      },
      warning,
    };
  };
}

interface LunaResponse {
  status: string;
  incomplete_details?: { reason?: string } | null;
  output: Array<{ type: string; name?: string; arguments?: string; content?: Array<{ type: string }> }>;
  usage?: {
    input_tokens: number;
    input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
    output_tokens: number;
  } | null;
}

function lunaCaller(apiKey: string, send: typeof fetch): ReplayCaller {
  return async (request) => {
    const review = request.mode === 'review';
    const response = await send('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: LUNA,
        max_output_tokens: review ? 16_000 : 4096,
        store: false,
        reasoning: { effort: review ? 'medium' : 'none' },
        instructions: request.system.map(block => block.text).join('\n\n'),
        input: request.messages.map(message => ({
          role: message.role,
          content: message.content.map(block => block.text).join('\n\n'),
        })),
        tools: request.tools.map(tool => ({
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
          strict: false,
        })),
      }),
    });
    if (!response.ok) throw new Error(`OpenAI replay failed (HTTP ${response.status}).`);
    const data = await response.json() as LunaResponse;
    if (data.status !== 'completed' && data.status !== 'incomplete') {
      throw new Error(`OpenAI replay ended with status ${data.status}.`);
    }
    if (!data.usage) throw new Error(`OpenAI replay ${data.status} response omitted token usage.`);

    const content: ReplayResponse['content'] = [];
    let warning = data.status === 'incomplete'
      ? `incomplete response (${data.incomplete_details?.reason ?? 'unknown reason'})` : undefined;
    for (const item of data.output) {
      if (item.type === 'function_call') {
        try {
          const input: unknown = JSON.parse(item.arguments ?? '');
          if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
          content.push({ type: 'tool_use', name: item.name, input });
        } catch {
          warning ??= 'skipped a function call with invalid JSON arguments';
        }
      }
      if (item.type === 'message' && item.content?.some(block => block.type === 'refusal')) warning ??= 'refused';
    }
    const cacheRead = data.usage.input_tokens_details?.cached_tokens ?? 0;
    const cacheWrite = data.usage.input_tokens_details?.cache_write_tokens ?? 0;
    return {
      content,
      usage: {
        input: Math.max(0, data.usage.input_tokens - cacheRead - cacheWrite),
        cacheRead,
        cacheWrite,
        output: data.usage.output_tokens,
      },
      warning,
    };
  };
}

export function createReplayCaller(model: string, env = process.env, send = fetch): ReplayCaller {
  if (model === LUNA) return lunaCaller(required(env, 'OPENAI_API_KEY'), send);
  if (model === QWEN_FLASH || model.startsWith('claude-')) return messagesCaller(model, env, send);
  throw new Error(`Unsupported replay model: ${model}`);
}

// Standard USD per million tokens. Qwen prices use the US service scope
// console tiers with explicit prompt caching. Tiers use the entire input,
// including cache reads and writes.
const CLAUDE_PRICES: Record<string, { input: number; read: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.10, read: 0.01, output: 0.50 },
  'claude-sonnet-5-5': { input: 2, read: 0.10, output: 10 },
  'claude-opus-5-5': { input: 4, read: 0.20, output: 20 },
  'claude-opus-4-8': { input: 5, read: 0.50, output: 25 },
};

export function replayCost(model: string, usage: ReplayUsage): number | undefined {
  const inputTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  let rate = CLAUDE_PRICES[model];
  if (model === QWEN_FLASH) {
    const rate = inputTokens <= 32_000 ? { input: 0.03, write: 0.038, read: 0.003, output: 0.13 }
      : inputTokens <= 256_000 ? { input: 0.10, write: 0.125, read: 0.01, output: 0.40 }
      : { input: 0.20, write: 0.25, read: 0.02, output: 0.80 };
    return (usage.input * rate.input + usage.cacheWrite * rate.write
      + usage.cacheRead * rate.read + usage.output * rate.output) / 1e6;
  }
  if (model === LUNA) {
    rate = inputTokens <= 272_000 ? { input: 0.10, read: 0.01, output: 0.50 }
      : { input: 0.20, read: 0.02, output: 0.75 };
  }
  if (model === 'claude-haiku-5-5' && inputTokens > 100_000) {
    rate = { input: 0.50, read: 0.05, output: 2.50 };
  }
  if (!rate) return undefined;
  return (usage.input * rate.input + usage.cacheWrite * rate.input * 1.25
    + usage.cacheRead * rate.read + usage.output * rate.output) / 1e6;
}
