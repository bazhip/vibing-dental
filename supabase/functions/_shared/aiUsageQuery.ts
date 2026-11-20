import { AI_REQUEST_KINDS, type AiRequestKind } from './aiModels.ts';

export const AI_USAGE_GROUPS = ['workflow_model', 'workflow', 'model', 'day'] as const;
export type AiUsageGroup = typeof AI_USAGE_GROUPS[number];
export interface AiUsageQuery {
  from: string;
  to: string;
  kind: string;
  model: string;
  groupBy: AiUsageGroup;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseAiUsageQuery(input: Record<string, unknown>): AiUsageQuery | null {
  const { from = '', to = '', kind = '', model = '', groupBy = 'workflow_model' } = input;
  if (typeof from !== 'string' || typeof to !== 'string' || (from && !validDate(from)) || (to && !validDate(to))) return null;
  if (from && to && from > to) return null;
  if (typeof kind !== 'string' || (kind && !AI_REQUEST_KINDS.includes(kind as AiRequestKind))) return null;
  if (typeof model !== 'string' || (model && !/^[a-zA-Z0-9._:-]{1,120}$/.test(model))) return null;
  if (!AI_USAGE_GROUPS.includes(groupBy as AiUsageGroup)) return null;
  return { from, to, kind, model, groupBy: groupBy as AiUsageGroup };
}

const RATES: Record<string, { in: number; out: number; cacheRead: number }> = {
  'claude-opus-5-5':   { in: 4,    out: 20,   cacheRead: 0.20 },
  'claude-sonnet-5-5': { in: 2,    out: 10,   cacheRead: 0.10 },
  'claude-haiku-5-5':  { in: 0.10, out: 0.50, cacheRead: 0.01 },
  'claude-opus-4':     { in: 5,    out: 25,   cacheRead: 0.50 },
  'claude-sonnet-4':   { in: 3,    out: 15,   cacheRead: 0.30 },
  'claude-haiku-4':    { in: 1,    out: 5,    cacheRead: 0.10 },
};

interface UsageTotalsRow {
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cache_write_1h_tokens?: number;
}

export function costOfAiUsage(row: Omit<UsageTotalsRow, 'calls'>): number {
  const prefix = Object.keys(RATES).find(key => row.model.startsWith(key));
  const rate = prefix ? RATES[prefix] : RATES['claude-opus-4'];
  // Logged input already includes all cache writes at the input rate.
  // Pay an extra 25% for 5-minute writes and 100% for one-hour writes.
  const writes = row.cache_write_tokens ?? 0;
  const hourWrites = row.cache_write_1h_tokens ?? 0;
  const cachePremium = (writes - hourWrites) * 0.25 + hourWrites;
  return ((row.input_tokens + cachePremium) * rate.in +
    row.output_tokens * rate.out + row.cache_read_tokens * rate.cacheRead) / 1e6;
}

interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  estCostUsd: number;
}
interface AccountUsage extends UsageTotals { userId: string; email: string }
interface GroupUsage extends UsageTotals { feature: string; model: string; day: string; costPerCallUsd: number }
export interface AiUsageReport {
  totals: UsageTotals;
  users: AccountUsage[];
  breakdown: GroupUsage[];
  models: string[];
}
interface QueryResult {
  users: Array<UsageTotalsRow & { user_id: string }>;
  breakdown: Array<UsageTotalsRow & { kind: string; day: string | null }>;
  models: string[];
}

export function aggregateAiUsage(data: QueryResult, groupBy: AiUsageGroup, emails: ReadonlyMap<string, string>): AiUsageReport {
  const blank = (): UsageTotals => ({ calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, estCostUsd: 0 });
  const add = (total: UsageTotals, row: UsageTotalsRow) => {
    total.calls += row.calls;
    total.inputTokens += row.input_tokens;
    total.outputTokens += row.output_tokens;
    total.cacheReadTokens += row.cache_read_tokens;
    total.estCostUsd += costOfAiUsage(row);
  };
  const totals = blank();
  const users = new Map<string, AccountUsage>();
  for (const row of data.users) {
    const user = users.get(row.user_id) ?? { ...blank(), userId: row.user_id, email: emails.get(row.user_id) ?? '(deleted)' };
    add(user, row);
    add(totals, row);
    users.set(row.user_id, user);
  }
  const groups = new Map<string, GroupUsage>();
  for (const row of data.breakdown) {
    const feature = groupBy === 'workflow' || groupBy === 'workflow_model' ? row.kind : '';
    const model = groupBy === 'model' || groupBy === 'workflow_model' ? row.model : '';
    const day = groupBy === 'day' ? row.day ?? '' : '';
    const key = JSON.stringify([feature, model, day]);
    const group = groups.get(key) ?? { ...blank(), feature, model, day, costPerCallUsd: 0 };
    add(group, row);
    groups.set(key, group);
  }
  const breakdown = Array.from(groups.values());
  for (const row of breakdown) row.costPerCallUsd = row.calls ? row.estCostUsd / row.calls : 0;
  breakdown.sort(groupBy === 'day' ? (a, b) => b.day.localeCompare(a.day) : (a, b) => b.estCostUsd - a.estCostUsd);
  return { totals, users: Array.from(users.values()).sort((a, b) => b.estCostUsd - a.estCostUsd), breakdown, models: data.models };
}
