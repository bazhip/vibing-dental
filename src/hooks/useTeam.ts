import React from 'react';
import { supabase, cloudEnabled } from '../utils/supabaseClient';

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
  error: string;
  refresh: () => Promise<void>;
  createPractice: (name: string) => Promise<void>;
  /** Returns true when a new account was invited (vs. an existing one added). */
  addMember: (email: string) => Promise<boolean>;
  /** Re-send the activation email to a pending (never-activated) member. */
  resendInvite: (userId: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  setRole: (userId: string, role: 'owner' | 'member') => Promise<void>;
  transferOwnership: (userId: string) => Promise<void>;
}

async function call<T = Record<string, unknown>>(body: object): Promise<T> {
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
      setError(e instanceof Error ? e.message : 'Could not load your team.');
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

  const addMember = React.useCallback(async (email: string): Promise<boolean> => {
    // Invited accounts get an email link back to wherever the owner is.
    const redirectTo = window.location.origin + window.location.pathname;
    const res = await call<{ invited?: boolean }>({ action: 'add_member', email, redirectTo });
    await refresh();
    return !!res.invited;
  }, [refresh]);

  const resendInvite = React.useCallback(async (userId: string) => {
    const redirectTo = window.location.origin + window.location.pathname;
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
