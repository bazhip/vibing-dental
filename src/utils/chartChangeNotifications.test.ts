import { expect, it, vi } from 'vitest';
import { subscribeToChartChanges } from './chartChangeNotifications';
import type { SupabaseClient } from '@supabase/supabase-js';

it('refreshes on live changes and resubscription and removes both private channels', async () => {
  const changes = new Map<string, () => void>();
  const statuses = new Map<string, (status: string) => void>();
  const channel = vi.fn((topic: string) => ({
    on: (_type: string, _filter: object, receive: () => void) => {
      changes.set(topic, receive);
      return { subscribe: (status: (status: string) => void) => statuses.set(topic, status) };
    },
  }));
  const client = {
    channel,
    auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } } }) },
    removeChannel: vi.fn(async () => {}),
  };
  const refresh = vi.fn();
  const dispose = subscribeToChartChanges(client as unknown as SupabaseClient, 'clinic', refresh);
  await Promise.resolve();
  expect(channel.mock.calls).toEqual([
    ['charts:user:owner', { config: { private: true } }],
    ['charts:practice:clinic', { config: { private: true } }],
  ]);
  statuses.get('charts:user:owner')?.('SUBSCRIBED');
  changes.get('charts:practice:clinic')?.();
  expect(refresh).toHaveBeenCalledTimes(2);
  dispose();
  changes.get('charts:practice:clinic')?.();
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(client.removeChannel).toHaveBeenCalledTimes(2);
});
