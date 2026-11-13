import React from 'react';
import { supabase, cloudEnabled } from '../utils/supabaseClient';
import { emailLinkOrigin } from '../native/authReturn';
import { isNativeApp } from '../native/platform';
import { friendlyError } from '../components/ui/dialogs';
import i18n from '../i18n';

/**
 * Practice (multi-doctor) membership for the signed-in user. All calls
 * go through the team-api edge function, which enforces ownership with
 * the service role. A user owns at most one practice or belongs to one;
 * charts created while in a practice are shared with its members.
 */

export interface TeamMember {
  userId: string;
  email: string;
  doctorName: string;
  role: 'owner' | 'member';
  isYou: boolean;
  /** Invited but hasn't set a password / confirmed yet. */
  pending: boolean;
  /** The practice's primary owner (billing/deletion anchor). */
  isPrimaryOwner: boolean;
}

export interface TeamState {
  practice: { id: string; name: string } | null;
  role: 'owner' | 'member' | null;
  primaryOwnerId: string | null;
  members: TeamMember[];
}

export interface UseTeamReturn extends TeamState {
  enabled: boolean;
  loaded: boolean;
  /** Load failure for the team itself (not for an action) — '' when fine. */
  error: string;
  /** Re-fetch the team (also the Retry after a failed load). */
  refresh: () => Promise<void>;
  createPractice: (name: string) => Promise<void>;
  /** 'invited' = new account emailed a set-password link (joins on
   *  activation); 'pending' = existing account emailed a join link it
   *  must accept. */
  addMember: (email: string) => Promise<'invited' | 'pending'>;
  /** Re-send the activation email to a pending (never-activated) member. */
  resendInvite: (userId: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  setRole: (userId: string, role: 'owner' | 'member') => Promise<void>;
  transferOwnership: (userId: string) => Promise<void>;
}

export async function call<T = Record<string, unknown>>(body: object): Promise<T> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { data, error } = await supabase.functions.invoke('team-api', { body });
  if (error) {
    try {
      const detail = await (error as { context?: Response }).context?.json();
      if (detail?.error) throw new Error(detail.error);
    } catch (inner) {
      if (inner instanceof Error && inner.message) throw inner;
    }
    throw new Error(error.message);
  }
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

/** team-api's seat-limit refusals, word for word (the `add_member` case
 *  in supabase/functions/team-api/index.ts — keep the two in step). */
const SEAT_LIMIT_MESSAGES = new Set([
  'Your Individual plan is single-user — switch to a Practice plan (up to 5 people) to add your team.',
  'Practice plans include up to 5 team members — contact us about a larger plan.',
]);

/**
 * team-api's seat-limit refusals point at other plans ("switch to a
 * Practice plan", "contact us about a larger plan"). The app sells
 * nothing, so there they become a plain fact; the web keeps the server
 * message. Other errors pass through untouched.
 */
export function appSafeTeamError(err: unknown, native: boolean = isNativeApp()): unknown {
  if (native && err instanceof Error && SEAT_LIMIT_MESSAGES.has(err.message.trim())) {
    return new Error(i18n.t('account:team.seatLimit'));
  }
  return err;
}

export function useTeam(open: boolean): UseTeamReturn {
  const [state, setState] = React.useState<TeamState>({ practice: null, role: null, primaryOwnerId: null, members: [] });
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState('');

  const refresh = React.useCallback(async () => {
    setError('');
    try {
      const data = await call<TeamState>({ action: 'get_team' });
      setState({ practice: data.practice, role: data.role, primaryOwnerId: data.primaryOwnerId ?? null, members: data.members ?? [] });
    } catch (e) {
      setError(friendlyError(e, 'Could not load your team.'));
    } finally {
      setLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    if (open && cloudEnabled) {
      setLoaded(false);
      refresh();
    }
  }, [open, refresh]);

  const createPractice = React.useCallback(async (name: string) => {
    await call({ action: 'create_practice', name });
    await refresh();
  }, [refresh]);

  const addMember = React.useCallback(async (email: string): Promise<'invited' | 'pending'> => {
    // Invited accounts get an email link back to wherever the owner is
    // (the website when the owner is in the app).
    const redirectTo = emailLinkOrigin();
    const res = await call<{ invited?: boolean; pending?: boolean }>({ action: 'add_member', email, redirectTo }).catch(
      (err: unknown) => {
        throw appSafeTeamError(err);
      }
    );
    await refresh();
    return res.pending ? 'pending' : 'invited';
  }, [refresh]);

  const resendInvite = React.useCallback(async (userId: string) => {
    const redirectTo = emailLinkOrigin();
    await call({ action: 'resend_invite', userId, redirectTo });
    await refresh();
  }, [refresh]);

  const removeMember = React.useCallback(async (userId: string) => {
    await call({ action: 'remove_member', userId });
    await refresh();
  }, [refresh]);

  const setRole = React.useCallback(async (userId: string, role: 'owner' | 'member') => {
    await call({ action: 'set_role', userId, role });
    await refresh();
  }, [refresh]);

  const transferOwnership = React.useCallback(async (userId: string) => {
    await call({ action: 'transfer_ownership', userId });
    await refresh();
  }, [refresh]);

  return {
    enabled: cloudEnabled,
    loaded,
    error,
    ...state,
    refresh,
    createPractice,
    addMember,
    resendInvite,
    removeMember,
    setRole,
    transferOwnership,
  };
}
