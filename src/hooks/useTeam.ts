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
}

export interface TeamState {
  practice: { id: string; name: string } | null;
  role: 'owner' | 'member' | null;
  members: TeamMember[];
}

export interface UseTeamReturn extends TeamState {
  enabled: boolean;
  loaded: boolean;
  error: string;
  refresh: () => Promise<void>;
  createPractice: (name: string) => Promise<void>;
  addMember: (email: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
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
  const [state, setState] = React.useState<TeamState>({ practice: null, role: null, members: [] });
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState('');

  const refresh = React.useCallback(async () => {
    setError('');
    try {
      const data = await call<TeamState>({ action: 'get_team' });
      setState({ practice: data.practice, role: data.role, members: data.members ?? [] });
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

  const addMember = React.useCallback(async (email: string) => {
    await call({ action: 'add_member', email });
    await refresh();
  }, [refresh]);

  const removeMember = React.useCallback(async (userId: string) => {
    await call({ action: 'remove_member', userId });
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
    removeMember,
  };
}
