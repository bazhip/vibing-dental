import React from 'react';
import { useTeam } from '../hooks/useTeam';

interface TeamPanelProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Team management. A user with no practice can create one (becoming
 * owner); the owner adds colleagues by email so the whole team shares
 * newly-created charts, templates, and images. Members see who's on the
 * team. Note: charts made before joining stay private to their creator.
 */
export const TeamPanel: React.FC<TeamPanelProps> = ({ open, onClose }) => {
  const team = useTeam(open);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [actionError, setActionError] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const run = async (msg: string, fn: () => Promise<void>) => {
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      await fn();
      setNotice(msg);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const isOwner = team.role === 'owner';

  return (
    <div className="ai-settings-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Team">
      <div className="ai-settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>Team</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="ai-settings-body">
          {!team.loaded ? (
            <p className="practice-logo-empty">Loading…</p>
          ) : !team.practice ? (
            <section className="ai-settings-section">
              <p className="ai-settings-blurb">
                Create a practice to share charts with colleagues. Charts,
                report templates, and images you create afterwards are
                visible to everyone you add.
              </p>
              <label className="patient-form__label">
                Practice name
                <input
                  type="text"
                  className="patient-form__input"
                  placeholder="e.g. VCA West LA — Dentistry"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <div className="practice-logo-actions" style={{ marginTop: '0.6rem' }}>
                <button
                  type="button"
                  className="entry-grid__button entry-grid__button--topbar"
                  disabled={busy || !name.trim()}
                  onClick={() => run('Practice created.', () => team.createPractice(name.trim()))}
                >
                  {busy ? 'Creating…' : 'Create practice'}
                </button>
              </div>
            </section>
          ) : (
            <>
              <section className="ai-settings-section">
                <span className="patient-form__label">
                  {team.practice.name || 'Your practice'}
                  {isOwner ? ' · you own this' : ' · you are a member'}
                </span>
                <ul className="team__members">
                  {team.members.map((m) => (
                    <li key={m.userId} className="team__member">
                      <span className="team__member-id">
                        <strong>{m.email}{m.isYou ? ' (you)' : ''}</strong>
                        {m.doctorName && <span className="team__member-name">{m.doctorName}</span>}
                      </span>
                      <span className="team__member-role">{m.role}</span>
                      {isOwner && !m.isYou && (
                        <button
                          type="button"
                          className="diagram-view__action diagram-view__action--danger"
                          disabled={busy}
                          onClick={() =>
                            window.confirm(`Remove ${m.email} from the practice? They keep their own charts.`) &&
                            run('Member removed.', () => team.removeMember(m.userId))
                          }
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              {isOwner && (
                <section className="ai-settings-section">
                  <label className="patient-form__label">
                    Add a colleague by email
                    <input
                      type="email"
                      className="patient-form__input"
                      placeholder="They must already have an account"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <div className="practice-logo-actions" style={{ marginTop: '0.6rem' }}>
                    <button
                      type="button"
                      className="diagram-view__action"
                      disabled={busy || !email.trim()}
                      onClick={() =>
                        run('Colleague added.', async () => {
                          await team.addMember(email.trim());
                          setEmail('');
                        })
                      }
                    >
                      Add to practice
                    </button>
                  </div>
                </section>
              )}
            </>
          )}

          {team.error && <div className="login-error" role="alert">{team.error}</div>}
          {actionError && <div className="login-error" role="alert">{actionError}</div>}
          {notice && <div className="login-notice" role="status">{notice}</div>}
        </div>
      </div>
    </div>
  );
};
