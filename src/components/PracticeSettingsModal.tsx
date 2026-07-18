import React from 'react';
import { UseProfileReturn } from '../hooks/useProfile';
import { useTeam } from '../hooks/useTeam';
import { useModalFocus } from '../hooks/useModalFocus';
import { cloudEnabled } from '../utils/supabaseClient';
import { BillingInfo, fetchBilling, openBillingPortal, changePlan } from '../hooks/useBilling';
import { PLANS, PlanKey, CONTACT_EMAIL, planKeyFor, planByKey } from '../constants/plans';

interface PracticeSettingsModalProps {
  open: boolean;
  onClose: () => void;
  profile: UseProfileReturn;
}

/**
 * The practice in one place: identity (name + logo, used in the topbar
 * and on generated PDFs) and the team (colleagues who share the
 * practice's charts). Per-account settings (doctor name, email,
 * password) live in Account settings; the recheck-reminder template
 * lives in its own Recheck reminders dialog. The practice name is
 * single-source: the same value labels the app, the PDF, and the shared
 * team practice.
 */
export const PracticeSettingsModal: React.FC<PracticeSettingsModalProps> = ({
  open,
  onClose,
  profile,
}) => {
  const [practiceName, setPracticeName] = React.useState(profile.practiceName);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);
  const firstFieldRef = React.useRef<HTMLInputElement>(null);
  const modalRef = useModalFocus(open);

  // Team state (loads when the dialog opens).
  const team = useTeam(open);
  const [memberEmail, setMemberEmail] = React.useState('');
  const [teamBusy, setTeamBusy] = React.useState(false);
  const [teamError, setTeamError] = React.useState('');
  const [teamNote, setTeamNote] = React.useState('');

  // Billing state (owner-managed; members just see the plan).
  const [billing, setBilling] = React.useState<BillingInfo | null>(null);
  const [billingBusy, setBillingBusy] = React.useState(false);
  const [billingError, setBillingError] = React.useState('');
  const [billingNote, setBillingNote] = React.useState('');

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
        if (!cancelled) setBillingError(e instanceof Error ? e.message : 'Could not load billing.');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (open) {
      setPracticeName(profile.practiceName);
      setError('');
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
      await profile.update({ practiceName: practiceName.trim(), doctorName: profile.doctorName });
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
  // Renaming the practice writes practices.name, which RLS restricts to
  // the PRIMARY owner — gate the field the same way. Solo accounts (no
  // practice yet) edit their own profile copy freely.
  const isPrimaryOwner = team.members.some((m) => m.isYou && m.isPrimaryOwner);
  const canRename = !team.loaded || !team.practice || isPrimaryOwner;

  return (
    <div className="ai-settings-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Practice">
      <div className="ai-settings-modal" ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
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
                disabled={!canRename}
              />
            </label>
            {!canRename && (
              <p className="patient-form__hint">
                The practice name is shared by the whole team — only the primary owner can change it.
              </p>
            )}
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

          {/* ---- Billing ------------------------------------------------- */}
          {cloudEnabled && (
            <section className="ai-settings-section">
              <h3 className="ai-settings-subhead">Billing</h3>
              {!billing ? (
                <p className="practice-logo-empty">{billingError || 'Loading billing…'}</p>
              ) : billing.status === 'comped' ? (
                <p className="ai-settings-blurb">
                  This practice has complimentary access — no subscription needed.
                </p>
              ) : (
                <>
                  <p className="ai-settings-blurb">
                    <strong>{planByKey(planKeyFor(billing.accountType, billing.plan))?.name ?? 'No plan'}</strong>
                    {' · '}
                    {billing.status === 'trialing'
                      ? `free trial${billing.periodEnd ? ` — first payment ${new Date(billing.periodEnd).toLocaleDateString()}` : ''}`
                      : billing.status === 'active'
                      ? `active${billing.periodEnd ? ` — renews ${new Date(billing.periodEnd).toLocaleDateString()}` : ''}`
                      : billing.status === 'past_due'
                      ? 'payment failed — update your card'
                      : billing.status === 'none'
                      ? 'not subscribed yet'
                      : billing.status}
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
                            onChange={(e) => {
                              const next = e.target.value as PlanKey;
                              const def = planByKey(next);
                              if (!def) return;
                              if (!window.confirm(`Switch to ${def.name} at $${def.priceMonthly}/mo? The difference is prorated.`)) return;
                              setBillingBusy(true);
                              setBillingError('');
                              setBillingNote('');
                              changePlan(next)
                                .then(() => fetchBilling())
                                .then((b) => {
                                  setBilling(b);
                                  setBillingNote('Plan updated.');
                                })
                                .catch((err) => setBillingError(err instanceof Error ? err.message : 'Could not change the plan.'))
                                .finally(() => setBillingBusy(false));
                            }}
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
                            onClick={() => {
                              setBillingBusy(true);
                              setBillingError('');
                              openBillingPortal().catch((err) => {
                                setBillingError(err instanceof Error ? err.message : 'Could not open the billing portal.');
                                setBillingBusy(false);
                              });
                            }}
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
                  {billingError && <div className="login-error" role="alert">{billingError}</div>}
                  {billingNote && <div className="login-notice" role="status">{billingNote}</div>}
                </>
              )}
            </section>
          )}

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
