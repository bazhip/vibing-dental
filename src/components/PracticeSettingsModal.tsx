import React from 'react';
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

/** "Primary owner" / "Owner" / "Member" — never the raw role key. */
export function roleLabel(m: Pick<TeamMember, 'role' | 'isPrimaryOwner'>): string {
  if (m.isPrimaryOwner) return 'Primary owner';
  return m.role === 'owner' ? 'Owner' : 'Member';
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
        if (!cancelled) setBillingError(friendlyError(e, 'Could not load billing.'));
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
        title: 'Discard the practice name change?',
        message: 'The new practice name hasn’t been saved.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        danger: true,
      });
      if (!discard) return;
    }
    onClose();
  }, [nameBusy, nameDirty, onClose]);

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
      toast('Practice name saved.', { kind: 'success' });
      onClose();
    } catch (e) {
      setNameError(friendlyError(e, 'Could not save the practice name.'));
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
      toast('Logo updated.', { kind: 'success' });
    } catch (err) {
      setLogoError(friendlyError(err, 'Could not upload the logo.'));
    } finally {
      setLogoBusy(false);
    }
  };

  const handleLogoRemove = async () => {
    const ok = await confirmDialog({
      title: 'Remove the practice logo?',
      message: 'New charts and PDFs will use the template’s built-in mark until you upload another.',
      confirmLabel: 'Remove logo',
      danger: true,
    });
    if (!ok) return;
    setLogoBusy(true);
    setLogoError('');
    try {
      await profile.removeLogo();
      toast('Logo removed.', { kind: 'success' });
    } catch (err) {
      setLogoError(friendlyError(err, 'Could not remove the logo.'));
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
      setTeamError(friendlyError(e, 'That didn’t work. Please try again.'));
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
      title: `Make ${m.email} the primary owner?`,
      message:
        'The primary owner holds billing and the practice name. You stay an owner of the practice.',
      confirmLabel: 'Transfer ownership',
      danger: true,
    });
    if (ok) await runTeam('Ownership transferred.', () => team.transferOwnership(m.userId));
  };

  const handleRemove = async (m: TeamMember) => {
    const ok = await confirmDialog({
      title: `Remove ${m.email} from the practice?`,
      message: m.pending
        ? 'Their invite is cancelled.'
        : 'They lose access to the practice’s shared charts but keep any charts of their own.',
      confirmLabel: m.pending ? 'Cancel invite' : 'Remove',
      cancelLabel: 'Keep',
      danger: true,
    });
    if (ok) await runTeam(m.pending ? 'Invite cancelled.' : 'Member removed.', () => team.removeMember(m.userId));
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = memberEmail.trim();
    if (!email || teamBusy) return;
    if (!EMAIL_RE.test(email)) {
      setTeamNote('');
      setTeamError('Enter a valid email address.');
      return;
    }
    setTeamBusy(true);
    setTeamError('');
    setTeamNote('');
    try {
      const result = await team.addMember(email);
      setTeamNote(
        result === 'invited'
          ? `Invite emailed to ${email} — they set a password and they're in.`
          : `${email} already has a ToothOps account — we emailed them a link to accept. They'll appear here once they join.`
      );
      setMemberEmail('');
    } catch (err) {
      setTeamError(friendlyError(err, 'Could not add them.'));
    } finally {
      setTeamBusy(false);
    }
  };

  const handlePlanChange = async (next: PlanKey) => {
    const def = planByKey(next);
    if (!def) return;
    const ok = await confirmDialog({
      title: `Switch to ${def.name}?`,
      message: `$${def.priceMonthly}/month. The difference is prorated on your next invoice.`,
      confirmLabel: 'Switch plan',
    });
    if (!ok) return;
    setBillingBusy(true);
    setBillingError('');
    setBillingNote('');
    try {
      await changePlan(next);
      setBilling(await fetchBilling());
      setBillingNote('Plan updated.');
    } catch (err) {
      setBillingError(friendlyError(err, 'Could not change the plan.'));
    } finally {
      setBillingBusy(false);
    }
  };

  const handleOpenPortal = () => {
    setBillingBusy(true);
    setBillingError('');
    openBillingPortal().catch((err) => {
      setBillingError(friendlyError(err, 'Could not open the billing portal.'));
      setBillingBusy(false);
    });
  };

  const teamLoadErrorRow = (
    <div className="login-error settings-msg settings-msg--row" role="alert">
      <span>Couldn’t load your team. {team.error}</span>
      <button
        type="button"
        className="diagram-view__action settings-msg__action"
        onClick={retryTeam}
        disabled={teamRetrying}
      >
        {teamRetrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );

  const liveSubscription = !!billing && LIVE_STATUSES.includes(billing.status);
  const onFreeBeta = FREE_BETA && !!billing && !liveSubscription && billing.status !== 'comped';

  const statusText = (b: BillingInfo) =>
    b.status === 'trialing'
      ? `free trial${b.periodEnd ? ` — first payment ${new Date(b.periodEnd).toLocaleDateString()}` : ''}`
      : b.status === 'active'
      ? `active${b.periodEnd ? ` — renews ${new Date(b.periodEnd).toLocaleDateString()}` : ''}`
      : b.status === 'past_due'
      ? 'payment failed — update your card'
      : b.status === 'none'
      ? 'not subscribed yet'
      : b.status.replace(/_/g, ' ');

  return (
    <div className="ai-settings-overlay" {...backdrop} role="dialog" aria-modal="true" aria-labelledby="practice-settings-title">
      <div className="ai-settings-modal" ref={modalRef} tabIndex={-1}>
        <header className="ai-settings-header">
          <h2 id="practice-settings-title">Practice settings</h2>
          <button type="button" className="pdf-preview-close" onClick={() => void requestClose()} aria-label="Close">
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
            <h3 className="ai-settings-subhead">Profile</h3>
            <label className="patient-form__label">
              Practice name
              <input
                ref={firstFieldRef}
                type="text"
                className="patient-form__input"
                value={practiceName}
                onChange={(e) => {
                  setPracticeName(e.target.value);
                  setNameError('');
                }}
                placeholder="Shown in the app and on every chart"
                disabled={!canRename || nameBusy}
              />
            </label>
            {!canRename && (
              <p className="patient-form__hint">
                {teamLoadFailed
                  ? 'The practice name is locked until your team loads — retry below.'
                  : 'The practice name is shared by the whole team — only the primary owner can change it.'}
              </p>
            )}
            {nameError && <div className="login-error settings-msg" role="alert">{nameError}</div>}
          </form>

          {/* ---- Logo --------------------------------------------------- */}
          <section className="ai-settings-section">
            <span className="patient-form__label">Practice logo</span>
            {profile.logoUrl ? (
              <div className="practice-logo-row">
                <img src={profile.logoUrl} alt="Practice logo" className="practice-logo-preview" />
                <div className="practice-logo-actions">
                  <button type="button" className="diagram-view__action" onClick={() => fileRef.current?.click()} disabled={busy}>
                    {logoBusy ? 'Working…' : 'Replace'}
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
                  {logoBusy ? 'Uploading…' : 'Upload logo'}
                </button>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleLogoPick}
              style={{ display: 'none' }}
              aria-label="Choose a logo image"
            />
            {logoError && <div className="login-error settings-msg" role="alert">{logoError}</div>}
          </section>

          {/* ---- Team --------------------------------------------------- */}
          <section className="ai-settings-section">
            <h3 className="ai-settings-subhead">Team</h3>
            {!team.enabled ? null : !team.loaded ? (
              <p className="practice-logo-empty">Loading team…</p>
            ) : teamLoadFailed ? (
              teamLoadErrorRow
            ) : !team.practice ? (
              <div className="settings-msg--row">
                <p className="practice-logo-empty">Your practice is still being set up.</p>
                <button
                  type="button"
                  className="diagram-view__action"
                  onClick={retryTeam}
                  disabled={teamRetrying}
                >
                  {teamRetrying ? 'Checking…' : 'Check again'}
                </button>
              </div>
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
                      <span className="team__member-role">{roleLabel(m)}</span>
                      {isOwner && !m.isYou && (
                        <span className="team__member-actions">
                          {m.pending && (
                            <button
                              type="button"
                              className="diagram-view__action"
                              disabled={teamBusy}
                              onClick={() =>
                                runTeam(`Invite re-sent to ${m.email}.`, () => team.resendInvite(m.userId))
                              }
                            >
                              Resend invite
                            </button>
                          )}
                          {/* Roles only apply to people who've joined —
                              a pending invite can't own anything yet. */}
                          {!m.pending && m.role === 'member' && (
                            <button
                              type="button"
                              className="diagram-view__action"
                              disabled={teamBusy}
                              onClick={() => runTeam(`${m.email} is now an owner.`, () => team.setRole(m.userId, 'owner'))}
                            >
                              Make owner
                            </button>
                          )}
                          {!m.pending && m.role === 'owner' && !m.isPrimaryOwner && (
                            <button
                              type="button"
                              className="diagram-view__action"
                              disabled={teamBusy}
                              onClick={() => runTeam(`${m.email} is now a member.`, () => team.setRole(m.userId, 'member'))}
                            >
                              Make member
                            </button>
                          )}
                          {!m.isPrimaryOwner && !m.pending && (
                            <button
                              type="button"
                              className="diagram-view__action"
                              disabled={teamBusy}
                              onClick={() => handleTransfer(m)}
                            >
                              Transfer ownership
                            </button>
                          )}
                          {!m.isPrimaryOwner && (
                            <button
                              type="button"
                              className="diagram-view__action diagram-view__action--danger"
                              disabled={teamBusy}
                              onClick={() => handleRemove(m)}
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
                    <form className="practice-team__add" onSubmit={handleAddMember} noValidate>
                      <input
                        type="email"
                        className="patient-form__input"
                        placeholder="Colleague's email"
                        aria-label="Colleague's email"
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
                        {teamBusy ? 'Adding…' : 'Add'}
                      </button>
                    </form>
                    <p className="patient-form__hint">
                      No account yet? We'll email them an invite to set a password and join.
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
              <h3 className="ai-settings-subhead">Owner report</h3>
              <p className="ai-settings-blurb">
                The report families take home after a dental visit — sections, headings, wording,
                language, and the practice-wide default layout.
              </p>
              <button
                type="button"
                className="diagram-view__action"
                onClick={() => setTemplatesOpen(true)}
              >
                Customize owner report
              </button>
            </section>
          )}

          {/* ---- Billing ------------------------------------------------- */}
          {cloudEnabled && (
            <section className="ai-settings-section">
              <h3 className="ai-settings-subhead">Billing</h3>
              {!billing ? (
                billingError ? (
                  <div className="login-error settings-msg settings-msg--row" role="alert">
                    <span>{billingError}</span>
                    <button
                      type="button"
                      className="diagram-view__action settings-msg__action"
                      onClick={() => setBillingLoadKey((k) => k + 1)}
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <p className="practice-logo-empty">Loading billing…</p>
                )
              ) : billing.status === 'comped' ? (
                <p className="ai-settings-blurb">
                  This practice has complimentary access — no subscription needed.
                </p>
              ) : onFreeBeta ? (
                <>
                  <p className="ai-settings-blurb">
                    <strong>Free beta</strong> · {FREE_BETA_SEATS} seats · {PLAN_LIMITS.free.maxImages} images per
                    chart · AI dictation included
                  </p>
                  <p className="patient-form__hint">
                    No card needed during the beta.
                    {billing.memberCount > 0 && ` ${billing.memberCount} of ${FREE_BETA_SEATS} seats in use.`}
                    {' '}Need more than {FREE_BETA_SEATS} seats?{' '}
                    <a href={`mailto:${CONTACT_EMAIL}?subject=ToothOps%20larger%20plan`}>Contact us</a>.
                  </p>
                  {billing.role === 'owner' && billing.hasStripe && (
                    <div className="practice-logo-actions">
                      <button type="button" className="diagram-view__action" disabled={billingBusy} onClick={handleOpenPortal}>
                        Billing history
                      </button>
                    </div>
                  )}
                  {billingError && <div className="login-error settings-msg" role="alert">{billingError}</div>}
                </>
              ) : (
                <>
                  <p className="ai-settings-blurb">
                    <strong>{planByKey(planKeyFor(billing.accountType, billing.plan))?.name ?? 'No plan'}</strong>
                    {' · '}
                    {statusText(billing)}
                    {billing.accountType === 'practice' && ` · ${billing.memberCount}/${billing.seats} seats`}
                  </p>
                  {billing.role === 'owner' ? (
                    <>
                      {billing.hasStripe && (
                        <div className="practice-team__add">
                          <select
                            className="patient-form__input"
                            value={planKeyFor(billing.accountType, billing.plan)}
                            disabled={billingBusy}
                            aria-label="Change plan"
                            onChange={(e) => void handlePlanChange(e.target.value as PlanKey)}
                          >
                            {PLANS.map((p) => (
                              <option key={p.key} value={p.key}>
                                {p.name} — ${p.priceMonthly}/mo
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="diagram-view__action"
                            disabled={billingBusy}
                            onClick={handleOpenPortal}
                          >
                            Manage billing
                          </button>
                        </div>
                      )}
                      <p className="patient-form__hint">
                        {billing.hasStripe
                          ? 'Manage billing opens Stripe — card, invoices, and cancellation.'
                          : 'You’ll be asked to pick a plan when your access needs one.'}
                        {' '}Need more than 5 seats?{' '}
                        <a href={`mailto:${CONTACT_EMAIL}?subject=ToothOps%20larger%20plan`}>Contact us</a>.
                      </p>
                    </>
                  ) : (
                    <p className="patient-form__hint">
                      Billing is managed by {billing.ownerEmail || 'the practice owner'}.
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
              <h3 className="ai-settings-subhead">Delete practice</h3>
              <p className="patient-form__hint">
                Permanently deletes the practice and every chart shared with it, including your
                team’s, and cancels any subscription. Team members keep their accounts and private charts.
              </p>
              <div className="practice-logo-actions">
                <button
                  type="button"
                  className="diagram-view__action diagram-view__action--danger"
                  onClick={() => void deleteMyPractice(team.practice?.name ?? '')}
                >
                  Delete practice…
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
                Cancel
              </button>
              <button
                type="button"
                className="entry-grid__button entry-grid__button--topbar"
                onClick={() => void handleSave()}
                disabled={nameBusy}
              >
                {nameBusy ? 'Saving…' : 'Save'}
              </button>
            </>
          ) : (
            <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={onClose}>
              Done
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};
