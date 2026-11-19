import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

/** Broadcasts only invalidate cached reads. Patient data is fetched under
 * the existing chart policies with the user's current session. */
export function subscribeToChartChanges(client: SupabaseClient, practiceId: string, refresh: () => void): () => void {
  let disposed = false;
  const channels: RealtimeChannel[] = [];
  const invalidate = () => { if (!disposed) refresh(); };
  const subscribe = (topic: string) => {
    const channel = client.channel(topic, { config: { private: true } });
    channels.push(channel);
    channel.on('broadcast', { event: 'chart-changed' }, invalidate)
      .subscribe(status => { if (status === 'SUBSCRIBED') invalidate(); });
  };
  void client.auth.getSession().then(({ data }) => {
    const userId = data.session?.user.id;
    if (disposed || !userId) return;
    subscribe(`charts:user:${userId}`);
    if (practiceId) subscribe(`charts:practice:${practiceId}`);
  }).catch(() => undefined);
  return () => {
    disposed = true;
    for (const channel of channels) void client.removeChannel(channel).catch(() => undefined);
  };
}
