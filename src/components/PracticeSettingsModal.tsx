import React from 'react';
import { UseProfileReturn } from '../hooks/useProfile';
import { supabase } from '../utils/supabaseClient';

interface PracticeSettingsModalProps {
  open: boolean;
  onClose: () => void;
  profile: UseProfileReturn;
}

/**
 * Practice profile editor: company name (topbar), doctor name (PDF
 * signature line), and the practice logo (replaces the template's mark
 * on generated charts). Reuses the AI-settings modal chrome.
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

  // Re-seed the fields each time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setPracticeName(profile.practiceName);
      setDoctorName(profile.doctorName);
      setError('');
      setNewPassword('');
      setPasswordNote('');
      firstFieldRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape closes, matching the other dialogs.
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
      await profile.update({
        practiceName: practiceName.trim(),
        doctorName: doctorName.trim(),
      });
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

  return (
    <div className="ai-settings-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Practice settings">
      <div className="ai-settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>Practice settings</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="ai-settings-body">
          <section className="ai-settings-section">
            <label className="patient-form__label">
              Practice name
              <input
                ref={firstFieldRef}
                type="text"
                className="patient-form__input"
                value={practiceName}
                onChange={(e) => setPracticeName(e.target.value)}
                placeholder="Shown at the top of the app"
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

          <section className="ai-settings-section">
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
