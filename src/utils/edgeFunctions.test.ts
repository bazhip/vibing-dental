import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('./supabaseClient', () => ({ supabase: { functions: { invoke } }, cloudEnabled: true }));

import i18n from '../i18n';
import { apiError } from '../../supabase/functions/_shared/apiErrors';
import { invokeFunction } from './edgeFunctions';
import { ApiError, LocalizedError } from './apiErrors';
import { sendAutofill } from './aiAutofill';
import { call as teamCall } from '../hooks/useTeam';
import { changePlan } from '../hooks/useBilling';

/** What supabase-js returns for a non-2xx reply with a JSON body. */
const httpError = (body: object, status: number) => ({
  data: null,
  error: { message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify(body), { status }) },
});

beforeEach(() => invoke.mockReset());
afterEach(async () => { await i18n.changeLanguage('en'); });

describe('invokeFunction', () => {
  it('turns a coded error reply into a translated ApiError', async () => {
    await i18n.changeLanguage('fr');
    invoke.mockResolvedValue(httpError(apiError('daily_reminder_limit'), 429));
    const err = await invokeFunction('send-reminder', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('Limite quotidienne de rappels atteinte (100). Réessayez demain.');
    expect(err.code).toBe('daily_reminder_limit');
    expect(err.status).toBe(429);
    expect(err.serverMessage).toBe('Daily reminder limit reached (100). Try again tomorrow.');
  });

  it('keeps today’s English for coded replies in en', async () => {
    invoke.mockResolvedValue(httpError(apiError('team_too_large', { members: 3, count: 1, plan: 'ToothOps Individual' }), 400));
    await expect(changePlan('individual_basic')).rejects.toThrow(
      'Your team has 3 members — remove members first or keep a Practice plan (1 seat on ToothOps Individual).');
    invoke.mockResolvedValue({ data: apiError('already_member'), error: null });
    await expect(teamCall({ action: 'add_member' })).rejects.toThrow('They’re already a member of this practice.');
  });

  it('leaves uncoded replies and transport failures as plain raw errors', async () => {
    invoke.mockResolvedValue(httpError({ error: 'duplicate key value' }, 500));
    const raw = await invokeFunction('team-api', {}).catch((e) => e);
    expect(raw).not.toBeInstanceOf(LocalizedError);
    expect(raw.message).toBe('duplicate key value');

    invoke.mockResolvedValue({ data: null, error: { message: 'Failed to send a request to the Edge Function', context: new Response('not json') } });
    const transport = await invokeFunction('team-api', {}).catch((e) => e);
    expect(transport).not.toBeInstanceOf(LocalizedError);
    expect(transport.message).toBe('Failed to send a request to the Edge Function');
  });

  it('returns the data on success', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(invokeFunction('team-api', { action: 'x' })).resolves.toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('team-api', { body: { action: 'x' } });
  });
});

describe('sendAutofill', () => {
  it('shows a coded AI error in the user’s language', async () => {
    await i18n.changeLanguage('de');
    invoke.mockResolvedValue(httpError(apiError('ai_daily_limit'), 429));
    await expect(sendAutofill({} as never)).rejects.toThrow('Tageslimit für KI erreicht. Es wird innerhalb von 24 Stunden zurückgesetzt.');
    // 429s are not in the English retry pattern ("Daily AI limit reached…"): one call only, as before.
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('still retries once on the server’s English text, whatever the language', async () => {
    vi.useFakeTimers();
    try {
      await i18n.changeLanguage('it');
      invoke
        .mockResolvedValueOnce(httpError(apiError('ai_rate_limit'), 429))
        .mockResolvedValueOnce({ data: { content: [] }, error: null });
      // "Slow down… too many AI requests" has no retry keyword…
      await expect(sendAutofill({} as never)).rejects.toThrow('Attenda un momento');
      expect(invoke).toHaveBeenCalledTimes(1);
      invoke.mockReset();
      invoke
        .mockResolvedValueOnce(httpError(apiError('ai_failed', { detail: 'rate_limit_error' }), 502))
        .mockResolvedValueOnce({ data: { content: [] }, error: null });
      const q = sendAutofill({} as never);
      await vi.runAllTimersAsync();
      // …"AI request failed: rate_limit_error" does.
      await expect(q).resolves.toEqual([]);
      expect(invoke).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
