import React from 'react';
import { UseProfileReturn } from '../hooks/useProfile';
import { useTeam } from '../hooks/useTeam';
import { supabase } from '../utils/supabaseClient';

interface PracticeSettingsModalProps {
  open: boolean;
  onClose: () => void;
  profile: UseProfileReturn;
}

/**
 * Everything about the practice in one place: identity (name, doctor,
 * logo — used in the topbar and on generated PDFs), the team (colleagues
 * who share the practice's charts), and this account's password. The
 * practice name is single-source: the same value labels the app, the
 * PDF, and — once created — the shared team practice.
 */
export const PracticeSettingsModal: React.FC<PracticeSettingsModalProps> = ({
  open,
  onClose,
  profile,
}) => {
  const [practiceName, setPracticeName] = React.useState(profile.practiceName);
  const [doctorName, setDoctorName] = React.useState(profile.doctorName);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [passwordNote, setPasswordNote] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);
  const firstFieldRef = React.useRef<HTMLInputElement>(null);

  // Team state (loads when the dialog opens).
  const team = useTeam(open);
  const [memberEmail, setMemberEmail] = React.useState('');
  const [teamBusy, setTeamBusy] = React.useState(false);
  const [teamError, setTeamError] = React.useState('');
  const [teamNote, setTeamNote] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setPracticeName(profile.practiceName);
      setDoctorName(profile.doctorName);
      setError('');
      setNewPassword('');
      setPasswordNote('');
      setMemberEmail('');
      setTeamError('');
      setTeamNote('');
      firstFieldRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = async () => {
    setBusy(true);
    setError('');
    try {
      await profile.update({ practiceName: practiceName.trim(), doctorName: doctorName.trim() });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the profile.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await profile.uploadLogo(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the logo.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogoRemove = async () => {
    setBusy(true);
    setError('');
    try {
      await profile.removeLogo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the logo.');
    } finally {
      setBusy(false);
    }
  };

  const runTeam = async (msg: string, fn: () => Promise<void>) => {
    setTeamBusy(true);
    setTeamError('');
    setTeamNote('');
    try {
      await fn();
      setTeamNote(msg);
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setTeamBusy(false);
    }
  };

  const isOwner = team.role === 'owner';

  return (
    <div className="ai-settings-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Practice">
      <div className="ai-settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>Practice</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="ai-settings-body">
          {/* ---- Identity ------------------------------------------------ */}
          <section className="ai-settings-section">
            <h3 className="ai-settings-subhead">Profile</h3>
            <label className="patient-form__label">
              Practice name
              <input
                ref={firstFieldRef}
                type="text"
                className="patient-form__input"
                value={practiceName}
                onChange={(e) => setPracticeName(e.target.value)}
                placeholder="Shown in the app and on every chart"
              />
            </label>
            <label className="patient-form__label" style={{ marginTop: '0.75rem' }}>
              Doctor name
              <input
                type="text"
                className="patient-form__input"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="Printed under the logo on every chart"
              />
            </label>
          </section>

          {/* ---- Logo --------------------------------------------------- */}
          <section className="ai-settings-section">
            <span className="patient-form__label">Practice logo</span>
            {profile.logoUrl ? (
              <div className="practice-logo-row">
                <img src={profile.logoUrl} alt="Practice logo" className="practice-logo-preview" />
                <div className="practice-logo-actions">
                  <button type="button" className="diagram-view__action" onClick={() => fileRef.current?.click()} disabled={busy}>
                    Replace
                  </button>
                  <button type="button" className="diagram-view__action diagram-view__action--danger" onClick={handleLogoRemove} disabled={busy}>
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="practice-logo-row">
                <span className="practice-logo-empty">
                  No logo uploaded — charts use the template's built-in mark.
                </span>
                <button type="button" className="diagram-view__action" onClick={() => fileRef.current?.click()} disabled={busy}>
                  Upload logo
                </button>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleLogoPick}
              style={{ display: 'none' }}
            />
          </section>

          {/* ---- Team --------------------------------------------------- */}
          <section className="ai-settings-section">
            <h3 className="ai-settings-subhead">Team</h3>
            {!team.loaded ? (
              <p className="practice-logo-empty">Loading team…</p>
            ) : !team.practice ? (
              <p className="practice-logo-empty">
                Your practice is being set up — reload in a moment.
              </p>
            ) : (
              <>
                <p className="ai-settings-blurb">
                  {isOwner
                    ? 'Colleagues you add share this practice’s charts, templates, and images.'
                    : `You’re a member of ${team.practice.name}. You share this practice’s charts.`}
                </p>
                <ul className="team__members">
                  {team.members.map((m) => (
                    <li key={m.userId} className="team__member">
                      <span className="team__member-id">
                        <strong>{m.email}{m.isYou ? ' (you)' : ''}</strong>
                        {m.doctorName && <span className="team__member-name">{m.doctorName}</span>}
                      </span>
                      {m.pending && <span className="team__badge team__badge--pending">Pending invite</span>}
                      <span className="team__member-role">
                        {m.isPrimaryOwner ? 'Primary owner' : m.role}
                      </span>
                      {isOwner && !m.isYou && (
                        <span className="team__member-actions">
                          {m.role === 'member' ? (
                            <button
                              type="button"
                              className="diagram-view__action"
                              disabled={teamBusy}
                              onClick={() => runTeam('Now an owner.', () => team.setRole(m.userId, 'owner'))}
                            >
                              Make owner
                            </button>
                          ) : !m.isPrimaryOwner ? (
                            <button
                              type="button"
                              className="diagram-view__action"
                              disabled={teamBusy}
                              onClick={() => runTeam('Now a member.', () => team.setRole(m.userId, 'member'))}
                            >
                              Make member
                            </button>
                          ) : null}
                          {!m.isPrimaryOwner && !m.pending && (
                            <button
                              type="button"
                              className="diagram-view__action"
                              disabled={teamBusy}
                              onClick={() =>
                                window.confirm(`Transfer primary ownership of the practice to ${m.email}? You stay an owner.`) &&
                                runTeam('Ownership transferred.', () => team.transferOwnership(m.userId))
                              }
                            >
                              Transfer ownership
                            </button>
                          )}
                          {!m.isPrimaryOwner && (
                            <button
                              type="button"
                              className="diagram-view__action diagram-view__action--danger"
                              disabled={teamBusy}
                              onClick={() =>
                                window.confirm(`Remove ${m.email}? They keep their own charts.`) &&
                                runTeam('Member removed.', () => team.removeMember(m.userId))
                              }
                            >
                              Remove
                            </button>
                          )}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {isOwner && (
                  <>
                    <div className="practice-team__add">
                      <input
                        type="email"
                        className="patient-form__input"
                        placeholder="Colleague's email"
                        value={memberEmail}
                        onChange={(e) => setMemberEmail(e.target.value)}
                      />
                      <button
                        type="button"
                        className="diagram-view__action"
                        disabled={teamBusy || !memberEmail.trim()}
                        onClick={() => {
                          const email = memberEmail.trim();
                          setTeamBusy(true);
                          setTeamError('');
                          setTeamNote('');
                          team
                            .addMember(email)
                            .then((invited) => {
                              setTeamNote(
                                invited
                                  ? `Invite emailed to ${email} — they set a password and they're in.`
                                  : 'Colleague added.'
                              );
                              setMemberEmail('');
                            })
                            .catch((e) =>
                              setTeamError(e instanceof Error ? e.message : 'Could not add them.')
                            )
                            .finally(() => setTeamBusy(false));
                        }}
                      >
                        Add
                      </button>
                    </div>
                    <p className="patient-form__hint">
                      No account yet? We'll email them an invite to set a password and join.
                    </p>
                  </>
                )}
              </>
            )}
            {teamError && <div className="login-error" role="alert">{teamError}</div>}
            {teamNote && <div className="login-notice" role="status">{teamNote}</div>}
          </section>

          {/* ---- Account ------------------------------------------------ */}
          <section className="ai-settings-section">
            <h3 className="ai-settings-subhead">Account</h3>
            <label className="patient-form__label">
              Change password
              <input
                type="password"
                className="patient-form__input"
                autoComplete="new-password"
                placeholder="New password (min 6 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <div className="practice-logo-actions" style={{ marginTop: '0.6rem' }}>
              <button
                type="button"
                className="diagram-view__action"
                disabled={busy || newPassword.length < 6}
                onClick={async () => {
                  if (!supabase) return;
                  setBusy(true);
                  setError('');
                  setPasswordNote('');
                  const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
                  setBusy(false);
                  if (pwError) setError(pwError.message);
                  else {
                    setPasswordNote('Password updated.');
                    setNewPassword('');
                  }
                }}
              >
                Update password
              </button>
              {passwordNote && <span className="practice-logo-empty">{passwordNote}</span>}
            </div>
          </section>

          {error && <div className="login-error" role="alert">{error}</div>}
        </div>
        <footer className="ai-settings-footer">
          <button type="button" className="diagram-view__action" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
};
