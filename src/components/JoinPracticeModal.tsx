import React from 'react';
import { supabase } from '../utils/supabaseClient';
import { useModalFocus } from '../hooks/useModalFocus';
import { friendlyError } from './ui/dialogs';
import { useTranslation } from 'react-i18next';
import { isNativeApp } from '../native/platform';
import { Sheet } from '../ios/Sheet';
import { List, ListSection, SwitchRow } from '../ios/List';

interface JoinPracticeModalProps {
  token: string;
  /** Called after joining (true) or declining (false). */
  onDone: (joined: boolean) => void;
}

async function callTeamApi<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { data, error } = await supabase.functions.invoke('team-api', { body });
  if (error) {
    let msg = error.message;
    try {
      const detail = await (error as { context?: Response }).context?.json();
      if (detail?.error) msg = detail.error;
    } catch { /* keep msg */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

/**
 * Accept an invitation to join a practice (an existing account added by a
 * practice owner gets an emailed #/join/<token> link). Nothing changes
 * until the user accepts here; sharing their existing charts is a
 * separate, explicit choice.
 */
export const JoinPracticeModal: React.FC<JoinPracticeModalProps> = ({ token, onDone }) => {
  const native = isNativeApp();
  const { t } = useTranslation();
  const ref = useModalFocus<HTMLDivElement>(!native);
  const [practiceName, setPracticeName] = React.useState<string | null>(null);
  const [alreadyMember, setAlreadyMember] = React.useState(false);
  const [shareExisting, setShareExisting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    callTeamApi<{ practiceName: string; alreadyMember: boolean }>({ action: 'accept_invite', token, preview: true })
      .then((r) => {
        if (cancelled) return;
        setPracticeName(r.practiceName || 'this practice');
        setAlreadyMember(r.alreadyMember);
      })
      .catch((e) => { if (!cancelled) setError(friendlyError(e)); });
    return () => { cancelled = true; };
  }, [token]);

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      await callTeamApi({ action: 'accept_invite', token, shareExisting });
      onDone(true);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  if (native) {
    // A sheet: Not now (or swiping it away) declines, Join accepts.
    const canJoin = !!practiceName && !alreadyMember && !error;
    return (
      <Sheet
        open
        onClose={() => onDone(false)}
        title={practiceName ? `Join ${practiceName}?` : 'Practice invitation'}
        cancelLabel={alreadyMember || error ? t('actions.close') : 'Not now'}
        doneLabel={canJoin ? (busy ? 'Joining…' : t('ios.sheets.join.join')) : undefined}
        onDone={canJoin ? () => void accept() : undefined}
        doneDisabled={busy}
        confirmDismiss={() => !busy}
        detents={['medium', 'large']}
      >
        <div className="ios-form">
          {!practiceName && !error && <p className="ios-form-text">Checking your invitation…</p>}
          {practiceName && alreadyMember && <p className="ios-form-text">You’re already a member of {practiceName}.</p>}
          {canJoin && (
            <p className="ios-form-text">
              You’ve been invited to join <strong>{practiceName}</strong> on ToothOps. Members share the
              practice’s charts, report templates and recheck list, and new charts you save are shared
              with the team.
            </p>
          )}
          {error && <p className="ios-form-error" role="alert">{error}</p>}
        </div>
        {canJoin && (
          <List>
            <ListSection>
              <SwitchRow
                title="Also share the charts I’ve already made"
                checked={shareExisting}
                onChange={setShareExisting}
                disabled={busy}
              />
            </ListSection>
          </List>
        )}
      </Sheet>
    );
  }

  return (
    <div className="ai-settings-overlay" role="dialog" aria-modal="true" aria-labelledby="join-title">
      <div className="ai-settings-modal" ref={ref} tabIndex={-1} style={{ maxWidth: '28rem' }}>
        <header className="ai-settings-header">
          <h2 id="join-title">{practiceName ? `Join ${practiceName}?` : 'Practice invitation'}</h2>
        </header>
        <div className="ai-settings-body">
          {!practiceName && !error && <p>Checking your invitation…</p>}
          {practiceName && alreadyMember && <p>You’re already a member of {practiceName}.</p>}
          {practiceName && !alreadyMember && (
            <>
              <p>
                You’ve been invited to join <strong>{practiceName}</strong> on ToothOps. Members share the
                practice’s charts, report templates and recheck list, and new charts you save are shared
                with the team.
              </p>
              <label className="dental-grid__option" style={{ marginTop: '0.75rem' }}>
                <input type="checkbox" checked={shareExisting} onChange={(e) => setShareExisting(e.target.checked)} />
                Also share the charts I’ve already made
              </label>
            </>
          )}
          {error && <p className="login-error" role="alert">{error}</p>}
        </div>
        <footer className="ai-settings-footer">
          <button type="button" className="diagram-view__action" onClick={() => onDone(false)} disabled={busy}>
            {alreadyMember || error ? 'Close' : 'Not now'}
          </button>
          {practiceName && !alreadyMember && !error && (
            <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={accept} disabled={busy}>
              {busy ? 'Joining…' : `Join ${practiceName}`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};
