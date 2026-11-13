import React from 'react';
import { useTranslation } from 'react-i18next';
import { UseProfileReturn } from '../hooks/useProfile';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { supabase } from '../utils/supabaseClient';
import { confirmDialog, friendlyError, toast } from './ui/dialogs';
import { APP_LANGUAGES, AppLanguage, LANGUAGE_NAMES, LANGUAGE_SWITCHING_ENABLED, isAppLanguage } from '../i18n/config';
import { deleteMyAccount } from '../utils/accountDeletion';
import { useStackLeaveGuard } from '../ios/Stack';
import './Login.css';
import './AccountSurfaces.css';

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
  profile: UseProfileReturn;
  /** Language in effect, and how to change it (the select shows only while switching is enabled). */
  language?: AppLanguage;
  onLanguageChange?: (language: AppLanguage) => void;
  /** 'screen': the body only, as a pushed screen in the iOS app's Settings
   *  tab (the stack's Back asks about unsaved edits). Default: the dialog. */
  presentation?: 'modal' | 'screen';
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
  language = 'en',
  onLanguageChange,
  presentation = 'modal',
}) => {
  const asScreen = presentation === 'screen';
  const { t, i18n } = useTranslation('account');
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
  const modalRef = useModalFocus(open && !asScreen);

  React.useEffect(() => {
    if (open) {
      setDoctorName(profile.doctorName);
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setRequestedEmail('');
      setErrors({});
      // (A pushed screen doesn't raise the keyboard on arrival.)
      if (!asScreen) firstFieldRef.current?.focus();
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
    doctorDirty && t('unsaved.field.doctor'),
    emailDirty && t('unsaved.field.email'),
    passwordDirty && t('unsaved.field.password'),
  ].filter(Boolean) as string[];

  /** Asks before throwing away anything typed but not saved; false = stay. */
  const confirmLeave = React.useCallback(async (): Promise<boolean> => {
    if (busy) return false;
    if (unsaved.length > 0) {
      // en-GB joins "a, b and c" (no serial comma), matching the original English.
      const list = new Intl.ListFormat(i18n.language === 'en' ? 'en-GB' : i18n.language, {
        style: 'long',
        type: 'conjunction',
      }).format(unsaved);
      const discard = await confirmDialog({
        title: t('unsaved.title'),
        message: t('unsaved.message', { list, count: unsaved.length }),
        confirmLabel: t('unsaved.confirm'),
        cancelLabel: t('unsaved.cancel'),
        danger: true,
      });
      if (!discard) return false;
    }
    return true;
    // `unsaved` is derived from the deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, doctorDirty, emailDirty, passwordDirty, t, i18n.language]);

  /** Close, asking first when something typed hasn't been saved. */
  const requestClose = React.useCallback(async () => {
    if (busy) return;
    if (unsaved.length > 0 && !(await confirmLeave())) return;
    onClose();
    // `unsaved` is derived from confirmLeave's deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, confirmLeave, onClose]);
  useStackLeaveGuard(asScreen ? confirmLeave : null);

  React.useEffect(() => {
    if (!open || asScreen) return;
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
      toast(t('doctor.saved'), { kind: 'success' });
    } catch (err) {
      setSectionError('doctor', friendlyError(err, t('doctor.saveFailed')));
    } finally {
      setBusy(null);
    }
  };

  const saveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || busy || !emailDirty) return;
    const next = email.trim();
    if (!EMAIL_RE.test(next)) {
      setSectionError('email', t('email.invalid'));
      return;
    }
    setBusy('email');
    setSectionError('email', '');
    try {
      const { error } = await supabase.auth.updateUser({ email: next });
      if (error) throw error;
      setRequestedEmail(next);
      toast(t('email.sent'), { kind: 'success' });
    } catch (err) {
      setSectionError('email', friendlyError(err, t('email.changeFailed')));
    } finally {
      setBusy(null);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || busy) return;
    if (newPassword.length < MIN_PASSWORD) {
      setSectionError('password', t('password.tooShort', { min: MIN_PASSWORD }));
      return;
    }
    if (newPassword !== confirmPassword) {
      setSectionError('password', t('password.mismatch'));
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
      toast(t('password.updated'), { kind: 'success' });
    } catch (err) {
      setSectionError('password', friendlyError(err, t('password.updateFailed')));
    } finally {
      setBusy(null);
    }
  };

  const sectionError = (section: Section) =>
    errors[section] ? (
      <div className="login-error settings-msg" role="alert">{errors[section]}</div>
    ) : null;

  // Rendered below; computed here so the section keys stay out of the JSX.
  const doctorError = sectionError('doctor');
  const emailError = sectionError('email');
  const passwordError = sectionError('password');

  const tooShort = newPassword.length > 0 && newPassword.length < MIN_PASSWORD;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const accountBody = (
    <>
      {/* ---- Doctor name ------------------------------------------- */}
      <form className="ai-settings-section" onSubmit={saveDoctor}>
        <h3 className="ai-settings-subhead">{t('doctor.heading')}</h3>
        <p className="ai-settings-blurb">{t('doctor.blurb')}</p>
        <label className="patient-form__label">
          {t('doctor.heading')}
          <input
            ref={firstFieldRef}
            type="text"
            className="patient-form__input"
            value={doctorName}
            onChange={(e) => {
              setDoctorName(e.target.value);
              setSectionError('doctor', '');
            }}
            placeholder={t('doctor.placeholder')}
          />
        </label>
        <div className="practice-logo-actions" style={{ marginTop: '0.6rem' }}>
          <button type="submit" className="diagram-view__action" disabled={!!busy || !doctorDirty}>
            {busy === 'doctor' ? t('doctor.saving') : t('doctor.save')}
          </button>
        </div>
        {doctorError}
      </form>

      {/* ---- Language ---------------------------------------------- */}
      {LANGUAGE_SWITCHING_ENABLED && (
        <section className="ai-settings-section">
          <h3 className="ai-settings-subhead" id="account-language-heading">{t('language.heading')}</h3>
          <select
            className="patient-form__input"
            aria-labelledby="account-language-heading"
            value={language}
            onChange={(e) => isAppLanguage(e.target.value) && onLanguageChange?.(e.target.value)}
          >
            {APP_LANGUAGES.map((l) => (
              <option key={l} value={l}>{LANGUAGE_NAMES[l]}</option>
            ))}
          </select>
        </section>
      )}

      {/* ---- Email ------------------------------------------------- */}
      <form className="ai-settings-section" onSubmit={saveEmail} noValidate>
        <h3 className="ai-settings-subhead">{t('email.heading')}</h3>
        <label className="patient-form__label">
          {t('email.label')}
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
            {busy === 'email' ? t('email.sending') : t('email.change')}
          </button>
        </div>
        {requestedEmail && (
          <div className="login-notice settings-msg" role="status">
            {t('email.pending', { current: currentEmail, requested: requestedEmail })}
          </div>
        )}
        {emailError}
      </form>

      {/* ---- Password ---------------------------------------------- */}
      <form className="ai-settings-section" onSubmit={savePassword} noValidate>
        <h3 className="ai-settings-subhead">{t('password.heading')}</h3>
        {/* Hidden username field so password managers file the new
            password under the right account. */}
        <input type="text" name="username" autoComplete="username" value={currentEmail} readOnly hidden />
        <label className="patient-form__label">
          {t('password.newLabel')}
          <span className="settings-password">
            <input
              type={showPassword ? 'text' : 'password'}
              className="patient-form__input"
              autoComplete="new-password"
              placeholder={t('password.placeholder', { min: MIN_PASSWORD })}
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
              aria-label={showPassword ? t('password.hideAll') : t('password.showAll')}
              aria-pressed={showPassword}
            >
              {showPassword ? t('password.hide') : t('password.show')}
            </button>
          </span>
        </label>
        <label className="patient-form__label" style={{ marginTop: '0.6rem' }}>
          {t('password.confirmLabel')}
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
              ? t('password.hintShort', { min: MIN_PASSWORD, current: newPassword.length })
              : t('password.hintMismatch')}
          </p>
        )}
        <div className="practice-logo-actions" style={{ marginTop: '0.6rem' }}>
          <button
            type="submit"
            className="diagram-view__action"
            disabled={!!busy || newPassword.length < MIN_PASSWORD || confirmPassword.length === 0}
          >
            {busy === 'password' ? t('password.updating') : t('password.update')}
          </button>
        </div>
        {passwordError}
      </form>

      {currentEmail && (
        <section className="ai-settings-section">
          <h3 className="ai-settings-subhead">{t('delete.heading')}</h3>
          <p className="patient-form__hint">{t('delete.blurb')}</p>
          <div className="practice-logo-actions">
            <button
              type="button"
              className="diagram-view__action diagram-view__action--danger"
              disabled={!!busy}
              onClick={() => void deleteMyAccount(currentEmail)}
            >
              {t('delete.button')}
            </button>
          </div>
        </section>
      )}
    </>
  );

  if (asScreen) return <div className="ai-settings-body ios-settings-page">{accountBody}</div>;

  return (
    <div className="ai-settings-overlay" {...backdrop} role="dialog" aria-modal="true" aria-labelledby="account-settings-title">
      <div className="ai-settings-modal" ref={modalRef} tabIndex={-1}>
        <header className="ai-settings-header">
          <h2 id="account-settings-title">{t('title')}</h2>
          <button type="button" className="pdf-preview-close" onClick={() => void requestClose()} aria-label={t('actions.close', { ns: 'common' })}>
            ×
          </button>
        </header>
        <div className="ai-settings-body">
          {accountBody}
        </div>
        <footer className="ai-settings-footer">
          <button
            type="button"
            className="entry-grid__button entry-grid__button--topbar"
            onClick={() => void requestClose()}
            disabled={!!busy}
          >
            {t('done')}
          </button>
        </footer>
      </div>
    </div>
  );
};
