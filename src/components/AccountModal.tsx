import React from 'react';
import { UseProfileReturn } from '../hooks/useProfile';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { supabase } from '../utils/supabaseClient';
import { confirmDialog, friendlyError, toast } from './ui/dialogs';
import './Login.css';
import './AccountSurfaces.css';

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
  profile: UseProfileReturn;
}

export const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Section = 'doctor' | 'email' | 'password';

/**
 * This account's own settings — the things that belong to the person, not
 * the practice: their doctor line (printed under the logo on charts),
 * their sign-in email, and their password. Each section saves on its own
 * (Enter or its button); success is a toast, errors stay inline in the
 * section they belong to. "Done" asks before throwing away anything typed
 * but not saved.
 */
export const AccountModal: React.FC<AccountModalProps> = ({
  open,
  onClose,
  profile,
}) => {
  const [doctorName, setDoctorName] = React.useState(profile.doctorName);
  const [email, setEmail] = React.useState('');
  const [currentEmail, setCurrentEmail] = React.useState('');
  /** Address a change was requested to (awaiting confirmation). */
  const [requestedEmail, setRequestedEmail] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [busy, setBusy] = React.useState<Section | null>(null);
  const [errors, setErrors] = React.useState<Partial<Record<Section, string>>>({});
  const firstFieldRef = React.useRef<HTMLInputElement>(null);
  const modalRef = useModalFocus(open);

  React.useEffect(() => {
    if (open) {
      setDoctorName(profile.doctorName);
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setRequestedEmail('');
      setErrors({});
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

  const setSectionError = (section: Section, msg: string) =>
    setErrors((prev) => ({ ...prev, [section]: msg }));

  const doctorDirty = doctorName.trim() !== profile.doctorName.trim();
  const emailDirty =
    !!currentEmail && email.trim() !== currentEmail && email.trim() !== requestedEmail;
  const passwordDirty = newPassword !== '' || confirmPassword !== '';
  const unsaved = [
    doctorDirty && 'doctor name',
    emailDirty && 'email',
    passwordDirty && 'password',
  ].filter(Boolean) as string[];

  /** Close, asking first when something typed hasn't been saved. */
  const requestClose = React.useCallback(async () => {
    if (busy) return;
    if (unsaved.length > 0) {
      const list = unsaved.length === 1
        ? unsaved[0]
        : `${unsaved.slice(0, -1).join(', ')} and ${unsaved[unsaved.length - 1]}`;
      const discard = await confirmDialog({
        title: 'Discard unsaved changes?',
        message: `Your ${list} change${unsaved.length === 1 ? ' hasn’t' : 's haven’t'} been saved.`,
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        danger: true,
      });
      if (!discard) return;
    }
    onClose();
    // `unsaved` is derived from the deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, doctorDirty, emailDirty, passwordDirty, onClose]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void requestClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, requestClose]);

  const backdrop = useBackdropDismiss(() => void requestClose());

  if (!open) return null;

  const saveDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorDirty || busy) return;
    setBusy('doctor');
    setSectionError('doctor', '');
    try {
      await profile.update({ practiceName: profile.practiceName, doctorName: doctorName.trim() });
      toast('Doctor name saved.', { kind: 'success' });
    } catch (err) {
      setSectionError('doctor', friendlyError(err, 'Could not save the doctor name.'));
    } finally {
      setBusy(null);
    }
  };

  const saveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || busy || !emailDirty) return;
    const next = email.trim();
    if (!EMAIL_RE.test(next)) {
      setSectionError('email', 'Enter a valid email address.');
      return;
    }
    setBusy('email');
    setSectionError('email', '');
    try {
      const { error } = await supabase.auth.updateUser({ email: next });
      if (error) throw error;
      setRequestedEmail(next);
      toast('Confirmation emails sent.', { kind: 'success' });
    } catch (err) {
      setSectionError('email', friendlyError(err, 'Could not change the email.'));
    } finally {
      setBusy(null);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || busy) return;
    if (newPassword.length < MIN_PASSWORD) {
      setSectionError('password', `Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setSectionError('password', 'The two passwords don’t match.');
      return;
    }
    setBusy('password');
    setSectionError('password', '');
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      toast('Password updated.', { kind: 'success' });
    } catch (err) {
      setSectionError('password', friendlyError(err, 'Could not update the password.'));
    } finally {
      setBusy(null);
    }
  };

  const sectionError = (section: Section) =>
    errors[section] ? (
      <div className="login-error settings-msg" role="alert">{errors[section]}</div>
    ) : null;

  const tooShort = newPassword.length > 0 && newPassword.length < MIN_PASSWORD;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <div className="ai-settings-overlay" {...backdrop} role="dialog" aria-modal="true" aria-labelledby="account-settings-title">
      <div className="ai-settings-modal" ref={modalRef} tabIndex={-1}>
        <header className="ai-settings-header">
          <h2 id="account-settings-title">Account settings</h2>
          <button type="button" className="pdf-preview-close" onClick={() => void requestClose()} aria-label="Close">
            ×
          </button>
        </header>
        <div className="ai-settings-body">
          {/* ---- Doctor name ------------------------------------------- */}
          <form className="ai-settings-section" onSubmit={saveDoctor}>
            <h3 className="ai-settings-subhead">Doctor name</h3>
            <p className="ai-settings-blurb">Printed under the logo on every chart you create.</p>
            <label className="patient-form__label">
              Doctor name
              <input
                ref={firstFieldRef}
                type="text"
                className="patient-form__input"
                value={doctorName}
                onChange={(e) => {
                  setDoctorName(e.target.value);
                  setSectionError('doctor', '');
                }}
                placeholder="e.g. Dr. Jane Smith, DVM, DAVDC"
              />
            </label>
            <div className="practice-logo-actions" style={{ marginTop: '0.6rem' }}>
              <button type="submit" className="diagram-view__action" disabled={!!busy || !doctorDirty}>
                {busy === 'doctor' ? 'Saving…' : 'Save doctor name'}
              </button>
            </div>
            {sectionError('doctor')}
          </form>

          {/* ---- Email ------------------------------------------------- */}
          <form className="ai-settings-section" onSubmit={saveEmail} noValidate>
            <h3 className="ai-settings-subhead">Email</h3>
            <label className="patient-form__label">
              Sign-in email
              <input
                type="email"
                className="patient-form__input"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setSectionError('email', '');
                }}
              />
            </label>
            <div className="practice-logo-actions" style={{ marginTop: '0.6rem' }}>
              <button type="submit" className="diagram-view__action" disabled={!!busy || !emailDirty}>
                {busy === 'email' ? 'Sending…' : 'Change email'}
              </button>
            </div>
            {requestedEmail && (
              <div className="login-notice settings-msg" role="status">
                Check your inbox — confirm the change from both {currentEmail} and {requestedEmail} to finish.
                Until then, keep signing in with {currentEmail}.
              </div>
            )}
            {sectionError('email')}
          </form>

          {/* ---- Password ---------------------------------------------- */}
          <form className="ai-settings-section" onSubmit={savePassword} noValidate>
            <h3 className="ai-settings-subhead">Password</h3>
            {/* Hidden username field so password managers file the new
                password under the right account. */}
            <input type="text" name="username" autoComplete="username" value={currentEmail} readOnly hidden />
            <label className="patient-form__label">
              New password
              <span className="settings-password">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="patient-form__input"
                  autoComplete="new-password"
                  placeholder={`At least ${MIN_PASSWORD} characters`}
                  value={newPassword}
                  aria-invalid={tooShort || undefined}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setSectionError('password', '');
                  }}
                />
                <button
                  type="button"
                  className="settings-password__toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
            <label className="patient-form__label" style={{ marginTop: '0.6rem' }}>
              Confirm new password
              <input
                type={showPassword ? 'text' : 'password'}
                className="patient-form__input"
                autoComplete="new-password"
                value={confirmPassword}
                aria-invalid={mismatch || undefined}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setSectionError('password', '');
                }}
              />
            </label>
            {(tooShort || mismatch) && (
              <p className="patient-form__hint settings-hint--warn">
                {tooShort
                  ? `At least ${MIN_PASSWORD} characters · ${newPassword.length}/${MIN_PASSWORD}`
                  : 'The two passwords don’t match yet.'}
              </p>
            )}
            <div className="practice-logo-actions" style={{ marginTop: '0.6rem' }}>
              <button
                type="submit"
                className="diagram-view__action"
                disabled={!!busy || newPassword.length < MIN_PASSWORD || confirmPassword.length === 0}
              >
                {busy === 'password' ? 'Updating…' : 'Update password'}
              </button>
            </div>
            {sectionError('password')}
          </form>
        </div>
        <footer className="ai-settings-footer">
          <button
            type="button"
            className="entry-grid__button entry-grid__button--topbar"
            onClick={() => void requestClose()}
            disabled={!!busy}
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
};
