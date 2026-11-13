import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { formatDateTime } from '../i18n/format';
import { UseProfileReturn, PLAN_LIMITS } from '../hooks/useProfile';
import { useTeam, TeamMember } from '../hooks/useTeam';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { cloudEnabled } from '../utils/supabaseClient';
import { BillingInfo, fetchBilling, openBillingPortal, changePlan } from '../hooks/useBilling';
import {
  PLANS,
  PlanKey,
  CONTACT_EMAIL,
  FREE_BETA,
  FREE_BETA_SEATS,
  planKeyFor,
  planByKey,
  formatPlanPrice,
} from '../constants/plans';
import { OwnerReportTemplatesModal } from './OwnerReportTemplatesModal';
import { confirmDialog, friendlyError, toast } from './ui/dialogs';
import { deleteMyPractice } from '../utils/accountDeletion';
import './Login.css';
import './AccountSurfaces.css';

interface PracticeSettingsModalProps {
  open: boolean;
  onClose: () => void;
  profile: UseProfileReturn;
}

/** Subscription statuses that mean a real (Stripe) subscription exists. */
const LIVE_STATUSES = ['active', 'trialing', 'past_due'];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Known subscription statuses with a catalog entry; anything else shows Stripe's own word. */
const STATUS_WORDS = ['canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'] as const;

/** A date in the active language's plain numeric short form (what toLocaleDateString() gave). */
const numericDate = (d: Date | string) => formatDateTime(d, i18n.language, { year: 'numeric', month: 'numeric', day: 'numeric' });

/** "Primary owner" / "Owner" / "Member" — never the raw role key. */
export function roleLabel(m: Pick<TeamMember, 'role' | 'isPrimaryOwner'>): string {
  const t = i18n.getFixedT(null, 'settings');
  if (m.isPrimaryOwner) return t('practice.team.roles.primaryOwner');
  return m.role === 'owner' ? t('practice.team.roles.owner') : t('practice.team.roles.member');
}

/**
 * The practice in one place: identity (name + logo, used in the topbar
 * and on generated PDFs), the team (colleagues who share the practice's
 * charts), the owner report, and billing. Per-account settings (doctor
 * name, email, password) live in Account settings; the recheck-reminder
 * template lives in its own Recheck reminders dialog. The practice name
 * is single-source: the same value labels the app, the PDF, and the
 * shared team practice.
 *
 * Save model: the logo, team and billing actions apply immediately; only
 * the practice name is a draft. The footer reflects that — a single
 * "Done" when nothing is pending, "Cancel" / "Save" once the name has
 * been edited (and closing then asks before discarding it).
 */
export const PracticeSettingsModal: React.FC<PracticeSettingsModalProps> = ({
  open,
  onClose,
  profile,
}) => {
  const { t } = useTranslation('settings');
  const [practiceName, setPracticeName] = React.useState(profile.practiceName);
  const [nameBusy, setNameBusy] = React.useState(false);
  const [nameError, setNameError] = React.useState('');
  const [logoBusy, setLogoBusy] = React.useState(false);
  const [logoError, setLogoError] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);
  const firstFieldRef = React.useRef<HTMLInputElement>(null);
  // The owner-report template editor swaps in on top of this dialog.
  const [templatesOpen, setTemplatesOpen] = React.useState(false);
  const modalRef = useModalFocus(open && !templatesOpen);

  // Team state (loads when the dialog opens).
  const team = useTeam(open);
  const [memberEmail, setMemberEmail] = React.useState('');
  const [teamBusy, setTeamBusy] = React.useState(false);
  const [teamError, setTeamError] = React.useState('');
  const [teamNote, setTeamNote] = React.useState('');
  const [teamRetrying, setTeamRetrying] = React.useState(false);

  // Billing state (owner-managed; members just see the plan).
  const [billing, setBilling] = React.useState<BillingInfo | null>(null);
  const [billingBusy, setBillingBusy] = React.useState(false);
  const [billingError, setBillingError] = React.useState('');
  const [billingNote, setBillingNote] = React.useState('');
  const [billingLoadKey, setBillingLoadKey] = React.useState(0);

  React.useEffect(() => {
    if (!open || !cloudEnabled) return;
    let cancelled = false;
    setBilling(null);
    setBillingError('');
    setBillingNote('');
    fetchBilling()
      .then((b) => {
        if (!cancelled) setBilling(b);
      })
      .catch((e) => {
        if (!cancelled) setBillingError(friendlyError(e, t('settings.loadFailed', { ns: 'billing' })));
      });
    return () => {
      cancelled = true;
    };
  }, [open, billingLoadKey]);

  React.useEffect(() => {
    if (open) {
      setPracticeName(profile.practiceName);
      setNameError('');
      setLogoError('');
      setMemberEmail('');
      setTeamError('');
      setTeamNote('');
      firstFieldRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Renaming the practice writes practices.name, which RLS restricts to
  // the PRIMARY owner — gate the field the same way. Solo accounts (no
  // practice yet) edit their own profile copy freely. While the team
  // failed to load we can't tell who's the owner, so the field stays
  // locked rather than letting a member type a name that won't save.
  const isOwner = team.role === 'owner';
  const isPrimaryOwner = team.members.some((m) => m.isYou && m.isPrimaryOwner);
  const teamLoadFailed = team.loaded && !!team.error && !team.practice;
  const canRename = !team.enabled || (!teamLoadFailed && (!team.loaded || !team.practice || isPrimaryOwner));
  const nameDirty = canRename && practiceName.trim() !== profile.practiceName.trim();

  // The field locked after the user started typing (role arrived): drop
  // the draft so a stale value doesn't sit in a disabled field.
  React.useEffect(() => {
    if (!canRename) setPracticeName(profile.practiceName);
  }, [canRename, profile.practiceName]);

  const busy = nameBusy || logoBusy;

  /** Close, asking first when the practice name has an unsaved edit. */
  const requestClose = React.useCallback(async () => {
    if (nameBusy) return;
    if (nameDirty) {
      const discard = await confirmDialog({
        title: t('practice.discard.title'),
        message: t('practice.discard.message'),
        confirmLabel: t('practice.discard.confirm'),
        cancelLabel: t('practice.discard.cancel'),
        danger: true,
      });
      if (!discard) return;
    }
    onClose();
  }, [nameBusy, nameDirty, onClose, t]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // The templates dialog handles its own Escape (unsaved-changes
      // check), so only close the practice dialog when it's on top.
      if (e.key === 'Escape' && !templatesOpen) {
        e.preventDefault();
        void requestClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, requestClose, templatesOpen]);

  const backdrop = useBackdropDismiss(() => void requestClose());

  if (!open) return null;

  // The templates editor replaces the practice dialog while open — it
  // manages its own focus, Escape handling, and unsaved-changes guard.
  if (templatesOpen) {
    return (
      <OwnerReportTemplatesModal
        open
        onClose={() => setTemplatesOpen(false)}
        config={profile.ownerReportConfig}
        onSave={profile.saveOwnerReportConfig}
        canEdit={team.loaded && team.role === 'owner'}
        roleKnown={team.loaded}
        branding={{
          practiceName: profile.practiceName,
          doctorName: profile.doctorName,
          logoUrl: profile.logoUrl,
        }}
      />
    );
  }

  const handleSave = async () => {
    if (!nameDirty || nameBusy) return;
    setNameBusy(true);
    setNameError('');
    try {
      await profile.update({ practiceName: practiceName.trim(), doctorName: profile.doctorName });
      toast(t('practice.nameSaved'), { kind: 'success' });
      onClose();
    } catch (e) {
      setNameError(friendlyError(e, t('practice.nameSaveFailed')));
    } finally {
      setNameBusy(false);
    }
  };

  const handleLogoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoBusy(true);
    setLogoError('');
    try {
      await profile.uploadLogo(file);
      toast(t('practice.logo.updated'), { kind: 'success' });
    } catch (err) {
      setLogoError(friendlyError(err, t('practice.logo.uploadFailed')));
    } finally {
      setLogoBusy(false);
    }
  };

  const handleLogoRemove = async () => {
    const ok = await confirmDialog({
      title: t('practice.logo.removeTitle'),
      message: t('practice.logo.removeMessage'),
      confirmLabel: t('practice.logo.removeConfirm'),
      danger: true,
    });
    if (!ok) return;
    setLogoBusy(true);
    setLogoError('');
    try {
      await profile.removeLogo();
      toast(t('practice.logo.removed'), { kind: 'success' });
    } catch (err) {
      setLogoError(friendlyError(err, t('practice.logo.removeFailed')));
    } finally {
      setLogoBusy(false);
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
      setTeamError(friendlyError(e, t('practice.team.failed')));
    } finally {
      setTeamBusy(false);
    }
  };

  const retryTeam = async () => {
    setTeamRetrying(true);
    try {
      await team.refresh();
    } finally {
      setTeamRetrying(false);
    }
  };

  const handleTransfer = async (m: TeamMember) => {
    const ok = await confirmDialog({
      title: t('practice.team.transferTitle', { email: m.email }),
      message: t('practice.team.transferMessage'),
      confirmLabel: t('practice.team.transferConfirm'),
      danger: true,
    });
    if (ok) await runTeam(t('practice.team.transferred'), () => team.transferOwnership(m.userId));
  };

  const handleRemove = async (m: TeamMember) => {
    const ok = await confirmDialog({
      title: t('practice.team.removeTitle', { email: m.email }),
      message: m.pending ? t('practice.team.removePendingMessage') : t('practice.team.removeMessage'),
      confirmLabel: m.pending ? t('practice.team.cancelInvite') : t('practice.team.removeConfirm'),
      cancelLabel: t('practice.team.keep'),
      danger: true,
    });
    if (ok) await runTeam(m.pending ? t('practice.team.inviteCancelled') : t('practice.team.memberRemoved'), () => team.removeMember(m.userId));
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = memberEmail.trim();
    if (!email || teamBusy) return;
    if (!EMAIL_RE.test(email)) {
      setTeamNote('');
      setTeamError(t('practice.team.invalidEmail'));
      return;
    }
    setTeamBusy(true);
    setTeamError('');
    setTeamNote('');
    try {
      const result = await team.addMember(email);
      setTeamNote(
        result === 'invited'
          ? t('practice.team.invited', { email })
          : t('practice.team.existingAccount', { email })
      );
      setMemberEmail('');
    } catch (err) {
      setTeamError(friendlyError(err, t('practice.team.addFailed')));
    } finally {
      setTeamBusy(false);
    }
  };

  const handlePlanChange = async (next: PlanKey) => {
    const def = planByKey(next);
    if (!def) return;
    const ok = await confirmDialog({
      title: t('settings.switchTitle', { ns: 'billing', plan: def.name }),
      message: t('settings.switchMessage', { ns: 'billing', price: formatPlanPrice(def.priceMonthly) }),
      confirmLabel: t('settings.switchConfirm', { ns: 'billing' }),
    });
    if (!ok) return;
    setBillingBusy(true);
    setBillingError('');
    setBillingNote('');
    try {
      await changePlan(next);
      setBilling(await fetchBilling());
      setBillingNote(t('settings.planUpdated', { ns: 'billing' }));
    } catch (err) {
      setBillingError(friendlyError(err, t('settings.changeFailed', { ns: 'billing' })));
    } finally {
      setBillingBusy(false);
    }
  };

  const handleOpenPortal = () => {
    setBillingBusy(true);
    setBillingError('');
    openBillingPortal().catch((err) => {
      setBillingError(friendlyError(err, t('settings.portalFailed', { ns: 'billing' })));
      setBillingBusy(false);
    });
  };

  const teamLoadErrorRow = (
    <div className="login-error settings-msg settings-msg--row" role="alert">
      <span>{t('practice.team.loadError', { error: team.error })}</span>
      <button
        type="button"
        className="diagram-view__action settings-msg__action"
        onClick={retryTeam}
        disabled={teamRetrying}
      >
        {teamRetrying ? t('practice.team.retrying') : t('practice.team.retry')}
      </button>
    </div>
  );

  const liveSubscription = !!billing && LIVE_STATUSES.includes(billing.status);
  const onFreeBeta = FREE_BETA && !!billing && !liveSubscription && billing.status !== 'comped';

  const statusText = (b: BillingInfo) => {
    const date = b.periodEnd ? numericDate(b.periodEnd) : '';
    if (b.status === 'trialing') return b.periodEnd ? t('settings.status.trialingDate', { ns: 'billing', date }) : t('settings.status.trialing', { ns: 'billing' });
    if (b.status === 'active') return b.periodEnd ? t('settings.status.activeDate', { ns: 'billing', date }) : t('settings.status.active', { ns: 'billing' });
    if (b.status === 'past_due') return t('settings.status.past_due', { ns: 'billing' });
    if (b.status === 'none') return t('settings.status.none', { ns: 'billing' });
    const word = STATUS_WORDS.find((w) => w === b.status);
    return word ? t(`settings.status.${word}`, { ns: 'billing' }) : b.status.replace(/_/g, ' ');
  };

  return (
    <div className="ai-settings-overlay" {...backdrop} role="dialog" aria-modal="true" aria-labelledby="practice-settings-title">
      <div className="ai-settings-modal" ref={modalRef} tabIndex={-1}>
        <header className="ai-settings-header">
          <h2 id="practice-settings-title">{t('practice.title')}</h2>
          <button type="button" className="pdf-preview-close" onClick={() => void requestClose()} aria-label={t('actions.close', { ns: 'common' })}>
            ×
          </button>
        </header>
        <div className="ai-settings-body">
          {/* ---- Identity ------------------------------------------------ */}
          <form
            className="ai-settings-section"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
          >
            <h3 className="ai-settings-subhead">{t('practice.profile')}</h3>
            <label className="patient-form__label">
              {t('practice.nameLabel')}
              <input
                ref={firstFieldRef}
                type="text"
                className="patient-form__input"
                value={practiceName}
                onChange={(e) => {
                  setPracticeName(e.target.value);
                  setNameError('');
                }}
                placeholder={t('practice.namePlaceholder')}
                disabled={!canRename || nameBusy}
              />
            </label>
            {!canRename && (
              <p className="patient-form__hint">
                {teamLoadFailed ? t('practice.nameLockedLoading') : t('practice.nameLockedShared')}
              </p>
            )}
            {nameError && <div className="login-error settings-msg" role="alert">{nameError}</div>}
          </form>

          {/* ---- Logo --------------------------------------------------- */}
          <section className="ai-settings-section">
            <span className="patient-form__label">{t('practice.logo.label')}</span>
            {profile.logoUrl ? (
              <div className="practice-logo-row">
                <img src={profile.logoUrl} alt={t('practice.logo.alt')} className="practice-logo-preview" />
                <div className="practice-logo-actions">
                  <button type="button" className="diagram-view__action" onClick={() => fileRef.current?.click()} disabled={busy}>
                    {logoBusy ? t('practice.logo.working') : t('practice.logo.replace')}
                  </button>
                  <button type="button" className="diagram-view__action diagram-view__action--danger" onClick={handleLogoRemove} disabled={busy}>
                    {t('practice.logo.remove')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="practice-logo-row">
                <span className="practice-logo-empty">
                  {t('practice.logo.empty')}
                </span>
                <button type="button" className="diagram-view__action" onClick={() => fileRef.current?.click()} disabled={busy}>
                  {logoBusy ? t('practice.logo.uploading') : t('practice.logo.upload')}
                </button>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleLogoPick}
              style={{ display: 'none' }}
              aria-label={t('practice.logo.choose')}
            />
            {logoError && <div className="login-error settings-msg" role="alert">{logoError}</div>}
          </section>

          {/* ---- Team --------------------------------------------------- */}
          <section className="ai-settings-section">
            <h3 className="ai-settings-subhead">{t('practice.team.title')}</h3>
            {!team.enabled ? null : !team.loaded ? (
              <p className="practice-logo-empty">{t('practice.team.loading')}</p>
            ) : teamLoadFailed ? (
              teamLoadErrorRow
            ) : !team.practice ? (
              <div className="settings-msg--row">
                <p className="practice-logo-empty">{t('practice.team.settingUp')}</p>
                <button
                  type="button"
                  className="diagram-view__action"
                  onClick={retryTeam}
                  disabled={teamRetrying}
                >
                  {teamRetrying ? t('practice.team.checking') : t('practice.team.checkAgain')}
                </button>
              </div>
            ) : (
              <>
                <p className="ai-settings-blurb">
                  {isOwner
                    ? t('practice.team.ownerBlurb')
                    : t('practice.team.memberBlurb', { practice: team.practice.name })}
                </p>
                <ul className="team__members">
                  {team.members.map((m) => (
                    <li key={m.userId} className="team__member">
                      <span className="team__member-id">
                        <strong>{m.email}{m.isYou ? ` ${t('practice.team.you')}` : ''}</strong>
                        {m.doctorName && <span className="team__member-name">{m.doctorName}</span>}
                      </span>
                      {m.pending && <span className="team__badge team__badge--pending">{t('practice.team.pending')}</span>}
                      <span className="team__member-role">{roleLabel(m)}</span>
                      {isOwner && !m.isYou && (
                        <span className="team__member-actions">
                          {m.pending && (
                            <button
                              type="button"
                              className="diagram-view__action"
                              disabled={teamBusy}
                              onClick={() =>
                                runTeam(t('practice.team.inviteResent', { email: m.email }), () => team.resendInvite(m.userId))
                              }
                            >
                              {t('practice.team.resend')}
                            </button>
                          )}
                          {/* Roles only apply to people who've joined —
                              a pending invite can't own anything yet. */}
                          {!m.pending && m.role === 'member' && (
                            <button
                              type="button"
                              className="diagram-view__action"
                              disabled={teamBusy}
                              onClick={() => runTeam(t('practice.team.nowOwner', { email: m.email }), () => team.setRole(m.userId, 'owner'))}
                            >
                              {t('practice.team.makeOwner')}
                            </button>
                          )}
                          {!m.pending && m.role === 'owner' && !m.isPrimaryOwner && (
                            <button
                              type="button"
                              className="diagram-view__action"
                              disabled={teamBusy}
                              onClick={() => runTeam(t('practice.team.nowMember', { email: m.email }), () => team.setRole(m.userId, 'member'))}
                            >
                              {t('practice.team.makeMember')}
                            </button>
                          )}
                          {!m.isPrimaryOwner && !m.pending && (
                            <button
                              type="button"
                              className="diagram-view__action"
                              disabled={teamBusy}
                              onClick={() => handleTransfer(m)}
                            >
                              {t('practice.team.transfer')}
                            </button>
                          )}
                          {!m.isPrimaryOwner && (
                            <button
                              type="button"
                              className="diagram-view__action diagram-view__action--danger"
                              disabled={teamBusy}
                              onClick={() => handleRemove(m)}
                            >
                              {t('practice.team.remove')}
                            </button>
                          )}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {isOwner && (
                  <>
                    <form className="practice-team__add" onSubmit={handleAddMember} noValidate>
                      <input
                        type="email"
                        className="patient-form__input"
                        placeholder={t('practice.team.emailLabel')}
                        aria-label={t('practice.team.emailLabel')}
                        autoComplete="off"
                        value={memberEmail}
                        onChange={(e) => {
                          setMemberEmail(e.target.value);
                          setTeamError('');
                        }}
                      />
                      <button
                        type="submit"
                        className="diagram-view__action"
                        disabled={teamBusy || !memberEmail.trim()}
                      >
                        {teamBusy ? t('practice.team.adding') : t('practice.team.add')}
                      </button>
                    </form>
                    <p className="patient-form__hint">
                      {t('practice.team.inviteHint')}
                    </p>
                  </>
                )}
                {/* A refresh after an action failed — the list above may be stale. */}
                {team.error && teamLoadErrorRow}
              </>
            )}
            {teamError && <div className="login-error settings-msg" role="alert">{teamError}</div>}
            {teamNote && <div className="login-notice settings-msg" role="status">{teamNote}</div>}
          </section>

          {/* ---- Owner report --------------------------------------------- */}
          {profile.ownerReportEnabled && (
            <section className="ai-settings-section">
              <h3 className="ai-settings-subhead">{t('practice.ownerReport.title')}</h3>
              <p className="ai-settings-blurb">
                {t('practice.ownerReport.blurb')}
              </p>
              <button
                type="button"
                className="diagram-view__action"
                onClick={() => setTemplatesOpen(true)}
              >
                {t('practice.ownerReport.customize')}
              </button>
            </section>
          )}

          {/* ---- Billing ------------------------------------------------- */}
          {cloudEnabled && (
            <section className="ai-settings-section">
              <h3 className="ai-settings-subhead">{t('settings.title', { ns: 'billing' })}</h3>
              {!billing ? (
                billingError ? (
                  <div className="login-error settings-msg settings-msg--row" role="alert">
                    <span>{billingError}</span>
                    <button
                      type="button"
                      className="diagram-view__action settings-msg__action"
                      onClick={() => setBillingLoadKey((k) => k + 1)}
                    >
                      {t('settings.retry', { ns: 'billing' })}
                    </button>
                  </div>
                ) : (
                  <p className="practice-logo-empty">{t('settings.loading', { ns: 'billing' })}</p>
                )
              ) : billing.status === 'comped' ? (
                <p className="ai-settings-blurb">
                  {t('settings.comped', { ns: 'billing' })}
                </p>
              ) : onFreeBeta ? (
                <>
                  <p className="ai-settings-blurb">
                    <Trans
                      ns="billing"
                      i18nKey="settings.freeBeta"
                      values={{ seats: FREE_BETA_SEATS, images: PLAN_LIMITS.free.maxImages }}
                      components={{ strong: <strong /> }}
                    />
                  </p>
                  <p className="patient-form__hint">
                    {t('settings.noCard', { ns: 'billing' })}
                    {billing.memberCount > 0 && ` ${t('settings.seatsInUse', { ns: 'billing', used: billing.memberCount, seats: FREE_BETA_SEATS })}`}
                    {' '}
                    <Trans
                      ns="billing"
                      i18nKey="settings.needMoreBeta"
                      values={{ seats: FREE_BETA_SEATS }}
                      components={{ a: <a href={`mailto:${CONTACT_EMAIL}?subject=ToothOps%20larger%20plan`} /> }}
                    />
                  </p>
                  {billing.role === 'owner' && billing.hasStripe && (
                    <div className="practice-logo-actions">
                      <button type="button" className="diagram-view__action" disabled={billingBusy} onClick={handleOpenPortal}>
                        {t('settings.history', { ns: 'billing' })}
                      </button>
                    </div>
                  )}
                  {billingError && <div className="login-error settings-msg" role="alert">{billingError}</div>}
                </>
              ) : (
                <>
                  <p className="ai-settings-blurb">
                    <strong>{planByKey(planKeyFor(billing.accountType, billing.plan))?.name ?? t('settings.noPlan', { ns: 'billing' })}</strong>
                    {' · '}
                    {statusText(billing)}
                    {billing.accountType === 'practice' && ` · ${t('settings.seatsUsed', { ns: 'billing', used: billing.memberCount, seats: billing.seats })}`}
                  </p>
                  {billing.role === 'owner' ? (
                    <>
                      {billing.hasStripe && (
                        <div className="practice-team__add">
                          <select
                            className="patient-form__input"
                            value={planKeyFor(billing.accountType, billing.plan)}
                            disabled={billingBusy}
                            aria-label={t('settings.changePlan', { ns: 'billing' })}
                            onChange={(e) => void handlePlanChange(e.target.value as PlanKey)}
                          >
                            {PLANS.map((p) => (
                              <option key={p.key} value={p.key}>
                                {t('settings.planOption', { ns: 'billing', name: p.name, price: formatPlanPrice(p.priceMonthly) })}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="diagram-view__action"
                            disabled={billingBusy}
                            onClick={handleOpenPortal}
                          >
                            {t('settings.manage', { ns: 'billing' })}
                          </button>
                        </div>
                      )}
                      <p className="patient-form__hint">
                        {billing.hasStripe ? t('settings.hintStripe', { ns: 'billing' }) : t('settings.hintNoStripe', { ns: 'billing' })}
                        {' '}
                        <Trans
                          ns="billing"
                          i18nKey="settings.needMore"
                          components={{ a: <a href={`mailto:${CONTACT_EMAIL}?subject=ToothOps%20larger%20plan`} /> }}
                        />
                      </p>
                    </>
                  ) : (
                    <p className="patient-form__hint">
                      {t('settings.managedBy', { ns: 'billing', owner: billing.ownerEmail || t('settings.theOwner', { ns: 'billing' }) })}
                    </p>
                  )}
                  {billingError && <div className="login-error settings-msg" role="alert">{billingError}</div>}
                  {billingNote && <div className="login-notice settings-msg" role="status">{billingNote}</div>}
                </>
              )}
            </section>
          )}

          {/* ---- Delete practice (primary owner only) -------------------- */}
          {team.practice && team.primaryOwnerId != null &&
            team.members.some((m) => m.isYou && m.userId === team.primaryOwnerId) && (
            <section className="ai-settings-section">
              <h3 className="ai-settings-subhead">{t('practice.deletion.title')}</h3>
              <p className="patient-form__hint">
                {t('practice.deletion.blurb')}
              </p>
              <div className="practice-logo-actions">
                <button
                  type="button"
                  className="diagram-view__action diagram-view__action--danger"
                  onClick={() => void deleteMyPractice(team.practice?.name ?? '')}
                >
                  {t('practice.deletion.button')}
                </button>
              </div>
            </section>
          )}
        </div>
        <footer className="ai-settings-footer">
          {/* Logo, team and billing apply instantly; only the practice
              name is a draft — so the footer only offers Save when it
              has something to save. */}
          {nameDirty ? (
            <>
              <button type="button" className="diagram-view__action" onClick={() => void requestClose()} disabled={nameBusy}>
                {t('actions.cancel', { ns: 'common' })}
              </button>
              <button
                type="button"
                className="entry-grid__button entry-grid__button--topbar"
                onClick={() => void handleSave()}
                disabled={nameBusy}
              >
                {nameBusy ? t('saving') : t('actions.save', { ns: 'common' })}
              </button>
            </>
          ) : (
            <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={onClose}>
              {t('done')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};
