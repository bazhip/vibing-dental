import { aggregateAiUsage, parseAiUsageQuery } from './aiUsageQuery';

it('accepts inclusive dates and valid exact filters and rejects invalid dates or grouping', () => {
  expect(parseAiUsageQuery({ from: '2028-02-29', to: '2028-02-29', kind: 'ct_report', model: 'claude-sonnet-5-5', groupBy: 'day' }))
    .toEqual({ from: '2028-02-29', to: '2028-02-29', kind: 'ct_report', model: 'claude-sonnet-5-5', groupBy: 'day' });
  expect(parseAiUsageQuery({ from: '2026-02-29' })).toBeNull();
  expect(parseAiUsageQuery({ from: '2026-11-19', to: '2026-11-18' })).toBeNull();
  expect(parseAiUsageQuery({ kind: 'not-a-workflow' })).toBeNull();
  expect(parseAiUsageQuery({ groupBy: 'hour' })).toBeNull();
});

it('prices actual models before summing the costs across workflows and accounts', () => {
  const calls = { calls: 2, input_tokens: 1_000_000, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 1_000_000 };
  const rows = [
    { ...calls, model: 'claude-sonnet-5-5', user_id: 'u' },
    { ...calls, model: 'claude-haiku-5-5', user_id: 'u' },
  ];
  const usage = aggregateAiUsage({
    users: rows,
    breakdown: rows.map(row => ({ ...row, kind: 'ct_report', day: null })),
    models: rows.map(row => row.model),
  }, 'workflow', new Map([['u', 'user@example.test']]));
  expect(usage.totals).toMatchObject({ calls: 4, estCostUsd: 2.625 });
  expect(usage.breakdown).toEqual([expect.objectContaining({ feature: 'ct_report', model: '', estCostUsd: 2.625 })]);
  expect(usage.users[0]).toMatchObject({ email: 'user@example.test', estCostUsd: 2.625 });
});

it('charges 1-hour and 5-minute prompt writes at their own rates', () => {
  const sonnet = {
    calls: 1, model: 'claude-sonnet-5-5', user_id: 'u',
    input_tokens: 1_000_000, output_tokens: 0, cache_read_tokens: 0,
    cache_write_tokens: 800_000, cache_write_1h_tokens: 500_000,
  };
  const result = aggregateAiUsage({
    users: [sonnet],
    breakdown: [{ ...sonnet, kind: 'review', day: null }],
    models: [sonnet.model],
  }, 'workflow', new Map());
  // 200k regular at $2, 300k five-minute at $2.50, 500k one-hour at $4.
  expect(result.totals.estCostUsd).toBe(3.15);
  expect(result.breakdown[0].estCostUsd).toBe(3.15);
  expect(result.users[0].estCostUsd).toBe(3.15);
});
