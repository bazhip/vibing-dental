import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { invokeFunction } from '../utils/edgeFunctions';
import { useModalFocus } from '../hooks/useModalFocus';
import { friendlyError } from './ui/dialogs';
import { isNativeApp } from '../native/platform';
import { Sheet, type SheetDetent } from '../ios/Sheet';
import { List, ListSection } from '../ios/List';

/** The sheet opens at half height and can be pulled to full. */
const HALF_OR_FULL: SheetDetent[] = ['medium', 'large'];

interface JoinPracticeModalProps {
  token: string;
  /** Called after joining (true) or declining (false). */
  onDone: (joined: boolean) => void;
}

const callTeamApi = <T,>(body: Record<string, unknown>): Promise<T> => invokeFunction<T>('team-api', body);

/**
 * Accept an invitation to join a practice (an existing account added by a
 * practice owner gets an emailed #/join/<token> link). Nothing changes
 * until the user accepts here; sharing their existing charts is a
 * separate, explicit choice.
 */
export const JoinPracticeModal: React.FC<JoinPracticeModalProps> = ({ token, onDone }) => {
  const native = isNativeApp();
  const { t } = useTranslation('onboarding');
  const ref = useModalFocus<HTMLDivElement>(!native);
  const [loaded, setLoaded] = React.useState(false);
  const [practiceName, setPracticeName] = React.useState('');
  // The practice they're in now, which joining moves them out of.
  const [leavingPractice, setLeavingPractice] = React.useState('');
  const [alreadyMember, setAlreadyMember] = React.useState(false);
  const [shareExisting, setShareExisting] = React.useState(false);
  // The invite couldn't be read (bad/expired link): nothing to join.
  const [error, setError] = React.useState('');
  // Joining failed (network, server): shown, and Join can be retried.
  const [joinError, setJoinError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    callTeamApi<{ practiceName: string; alreadyMember: boolean; leavingPractice?: string }>({ action: 'accept_invite', token, preview: true })
      .then((r) => {
        if (cancelled) return;
        setPracticeName(r.practiceName);
        setLeavingPractice(r.leavingPractice ?? '');
        setLoaded(true);
        setAlreadyMember(r.alreadyMember);
      })
      .catch((e) => { if (!cancelled) setError(friendlyError(e)); });
    return () => { cancelled = true; };
  }, [token]);

  const accept = async () => {
    setBusy(true);
    setJoinError('');
    try {
      await callTeamApi({ action: 'accept_invite', token, shareExisting });
      onDone(true);
    } catch (e) {
      setJoinError(friendlyError(e));
      setBusy(false);
    }
  };

  const name = practiceName || t('join.thisPractice');

  const shareConsent = (
    <label className="choice-row">
      <input type="checkbox" checked={shareExisting} disabled={busy} onChange={(e) => setShareExisting(e.target.checked)} />
      <span>{t('join.shareExisting')}</span>
    </label>
  );

  if (native) {
    // A sheet: Not now (or swiping it away) declines, Join accepts.
    const canJoin = loaded && !alreadyMember && !error;
    return (
      <Sheet
        open
        onClose={() => onDone(false)}
        title={loaded ? t('join.title', { practice: name }) : t('join.invitation')}
        cancelLabel={alreadyMember || error ? t('actions.close', { ns: 'common' }) : t('join.notNow')}
        doneLabel={canJoin ? (busy ? t('join.joining') : t('ios.sheets.join.join', { ns: 'common' })) : undefined}
        onDone={canJoin ? () => void accept() : undefined}
        doneDisabled={busy}
        confirmDismiss={() => !busy}
        detents={HALF_OR_FULL}
      >
        <div className="ios-form">
          {!loaded && !error && <p className="ios-form-text" role="status">{t('join.checking')}</p>}
          {loaded && alreadyMember && <p className="ios-form-text">{t('join.alreadyMember', { practice: name })}</p>}
          {canJoin && (
            <p className="ios-form-text">
              <Trans t={t} i18nKey="join.invited" values={{ practice: name }} components={{ strong: <strong /> }} />
            </p>
          )}
          {canJoin && leavingPractice && <p className="ios-form-text">{t('join.leaves', { practice: leavingPractice })}</p>}
          {(error || joinError) && <p className="ios-form-error" role="alert">{error || joinError}</p>}
        </div>
        {canJoin && (
          <List>
            <ListSection>
              <div role="listitem" className="ios-list__item">
                <div className="ios-row">
                  <div className="ios-row__main">{shareConsent}</div>
                </div>
              </div>
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
          <h2 id="join-title">{loaded ? t('join.title', { practice: name }) : t('join.invitation')}</h2>
        </header>
        <div className="ai-settings-body">
          {!loaded && !error && <p role="status">{t('join.checking')}</p>}
          {loaded && alreadyMember && <p>{t('join.alreadyMember', { practice: name })}</p>}
          {loaded && !alreadyMember && (
            <>
              <p>
                <Trans t={t} i18nKey="join.invited" values={{ practice: name }} components={{ strong: <strong /> }} />
              </p>
              {leavingPractice && <p>{t('join.leaves', { practice: leavingPractice })}</p>}
              {shareConsent}
            </>
          )}
          {(error || joinError) && <p className="login-error" role="alert">{error || joinError}</p>}
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
