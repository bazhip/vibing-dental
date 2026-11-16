// Stamp charts.pims_sent_at after the Chrome extension has sent a record note
// into the PIMS (ezyVet). verify_jwt on.
//
// The caller must be allowed to act on the chart (created it, or shares its
// practice); the stamp is written with the service role, same pattern as
// send-owner-report stamping owner_report_sent_at. The charts trigger keeps
// updated_at, so this does not make the chart look edited.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { apiError } from '../_shared/apiErrors.ts';
import { canAccessChart } from '../_shared/chartAccess.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: callerData } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (!caller) return json(apiError('unauthorized'), 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const chartId = typeof body.chartId === 'string' ? body.chartId : '';
  // No id means there is no saved chart to stamp.
  if (!chartId) return json(apiError('chart_gone'), 404);

  const { data: chart } = await admin
    .from('charts')
    .select('created_by, practice_id')
    .eq('id', chartId)
    .maybeSingle();
  if (!chart) return json(apiError('chart_gone'), 404);

  const { allowed } = await canAccessChart(admin, chart, caller.id);
  if (!allowed) return json(apiError('chart_forbidden'), 403);

  const sentAt = new Date().toISOString();
  const { error } = await admin.from('charts').update({ pims_sent_at: sentAt }).eq('id', chartId);
  if (error) return json({ error: error.message }, 500);
  return json({ sentAt });
});
