import React from 'react';
import { UseProfileReturn } from '../hooks/useProfile';
import { supabase } from '../utils/supabaseClient';

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
  profile: UseProfileReturn;
}

/**
 * This account's own settings — the things that belong to the person, not
 * the practice: their doctor line (printed under the logo on charts),
 * their sign-in email, and their password.
 */
export const AccountModal: React.FC<AccountModalProps> = ({
  open,
  onClose,
  profile,
}) => {
  const [doctorName, setDoctorName] = React.useState(profile.doctorName);
  const [email, setEmail] = React.useState('');
  const [currentEmail, setCurrentEmail] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [note, setNote] = React.useState('');
  const firstFieldRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setDoctorName(profile.doctorName);
      setNewPassword('');
      setError('');
      setNote('');
      firstFieldRef.current?.focus();
      // Load the signed-in account's current email for the change field.
      if (supabase) {
        supabase.auth.getUser().then(({ data }) => {
          const e = data.user?.email ?? '';
          setCurrentEmail(e);
          setEmail(e);
        });
      }
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

  const saveDoctor = async () => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await profile.update({ practiceName: profile.practiceName, doctorName: doctorName.trim() });
      setNote('Doctor name saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the doctor name.');
    } finally {
      setBusy(false);
    }
  };

  const saveEmail = async () => {
    if (!supabase) return;
    const next = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) {
      setError('Enter a valid email.');
      return;
    }
    setBusy(true);
    setError('');
    setNote('');
    const { error: e } = await supabase.auth.updateUser({ email: next });
    setBusy(false);
    if (e) setError(e.message);
    else setNote('Check your inbox — confirm the change from both the old and new address to finish.');
  };

  const savePassword = async () => {
    if (!supabase) return;
    setBusy(true);
    setError('');
    setNote('');
    const { error: e } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (e) setError(e.message);
    else {
      setNote('Password updated.');
      setNewPassword('');
    }
  };

  return (
    <div className="ai-settings-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Account settings">
      <div className="ai-settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>Account settings</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="ai-settings-body">
          {/* ---- Doctor name ------------------------------------------- */}
          <section className="ai-settings-section">
            <h3 className="ai-settings-subhead">Doctor name</h3>
            <p className="ai-settings-blurb">Printed under the logo on every chart you create.</p>
            <label className="patient-form__label">
              Doctor name
              <input
                ref={firstFieldRef}
                type="text"
                className="patient-form__input"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="e.g. Dr. Margaret Smith, DVM, DAVDC"
              />
            </label>
            <div className="practice-logo-actions" style={{ marginTop: '0.6rem' }}>
              <button type="button" className="diagram-view__action" disabled={busy} onClick={saveDoctor}>
                Save doctor name
              </button>
            </div>
          </section>

          {/* ---- Email ------------------------------------------------- */}
          <section className="ai-settings-section">
            <h3 className="ai-settings-subhead">Email</h3>
            <label className="patient-form__label">
              Sign-in email
              <input
                type="email"
                className="patient-form__input"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <div className="practice-logo-actions" style={{ marginTop: '0.6rem' }}>
              <button
                type="button"
                className="diagram-view__action"
                disabled={busy || email.trim() === currentEmail}
                onClick={saveEmail}
              >
                Change email
              </button>
            </div>
          </section>

          {/* ---- Password ---------------------------------------------- */}
          <section className="ai-settings-section">
            <h3 className="ai-settings-subhead">Password</h3>
            <label className="patient-form__label">
              New password
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
                onClick={savePassword}
              >
                Update password
              </button>
            </div>
          </section>

          {error && <div className="login-error" role="alert">{error}</div>}
          {note && <div className="login-notice" role="status">{note}</div>}
        </div>
        <footer className="ai-settings-footer">
          <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={onClose} disabled={busy}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
};
