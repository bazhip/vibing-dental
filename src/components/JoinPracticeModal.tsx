import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { supabase } from '../utils/supabaseClient';
import { useModalFocus } from '../hooks/useModalFocus';
import { friendlyError } from './ui/dialogs';

interface JoinPracticeModalProps {
  token: string;
  /** Called after joining (true) or declining (false). */
  onDone: (joined: boolean) => void;
}

async function callTeamApi<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error(i18n.t('sync.cloudNotConfigured', { ns: 'app' }));
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
  const { t } = useTranslation('onboarding');
  const ref = useModalFocus<HTMLDivElement>(true);
  const [loaded, setLoaded] = React.useState(false);
  const [practiceName, setPracticeName] = React.useState('');
  const [alreadyMember, setAlreadyMember] = React.useState(false);
  const [shareExisting, setShareExisting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    callTeamApi<{ practiceName: string; alreadyMember: boolean }>({ action: 'accept_invite', token, preview: true })
      .then((r) => {
        if (cancelled) return;
        setPracticeName(r.practiceName);
        setLoaded(true);
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

  const name = practiceName || t('join.thisPractice');

  return (
    <div className="ai-settings-overlay" role="dialog" aria-modal="true" aria-labelledby="join-title">
      <div className="ai-settings-modal" ref={ref} tabIndex={-1} style={{ maxWidth: '28rem' }}>
        <header className="ai-settings-header">
          <h2 id="join-title">{loaded ? t('join.title', { practice: name }) : t('join.invitation')}</h2>
        </header>
        <div className="ai-settings-body">
          {!loaded && !error && <p>{t('join.checking')}</p>}
          {loaded && alreadyMember && <p>{t('join.alreadyMember', { practice: name })}</p>}
          {loaded && !alreadyMember && (
            <>
              <p>
                <Trans t={t} i18nKey="join.invited" values={{ practice: name }} components={{ strong: <strong /> }} />
              </p>
              <label className="dental-grid__option" style={{ marginTop: '0.75rem' }}>
                <input type="checkbox" checked={shareExisting} onChange={(e) => setShareExisting(e.target.checked)} />
                {t('join.shareExisting')}
              </label>
            </>
          )}
          {error && <p className="login-error" role="alert">{error}</p>}
        </div>
        <footer className="ai-settings-footer">
          <button type="button" className="diagram-view__action" onClick={() => onDone(false)} disabled={busy}>
            {alreadyMember || error ? t('actions.close', { ns: 'common' }) : t('join.notNow')}
          </button>
          {loaded && !alreadyMember && !error && (
            <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={accept} disabled={busy}>
              {busy ? t('join.joining') : t('join.joinButton', { practice: name })}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};
