import React from 'react';
import { supabase } from '../utils/supabaseClient';
import { useModalFocus } from '../hooks/useModalFocus';

/**
 * Admin panel — visible only to the account whose app_metadata carries
 * role 'admin' (server-set). Every action here round-trips through the
 * admin-api edge function, which independently re-checks that role; the
 * browser never holds privileged credentials, and passwords can only be
 * set, never viewed.
 */

interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  isAdmin: boolean;
  practiceName: string;
  doctorName: string;
  hasLogo: boolean;
  chartCount: number;
}

interface AdminStats {
  users: number;
  charts: number;
  templates: number;
}

interface AdminPracticeMember {
  userId: string;
  email: string;
  role: string;
  pending: boolean;
  isPrimaryOwner: boolean;
}

interface AdminPractice {
  id: string;
  name: string;
  plan: 'basic' | 'pro';
  accountType: 'individual' | 'practice';
  subscriptionStatus: string;
  periodEnd: string | null;
  frozenAt: string | null;
  hasStripe: boolean;
  ownerEmail: string;
  logoUrl: string;
  memberCount: number;
  chartCount: number;
  members: AdminPracticeMember[];
}

interface BillingOverviewRow {
  practiceName: string;
  planKey: string;
  status: string;
  amountUsd: number;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface AiUsageRow {
  userId: string;
  email: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  estCostUsd: number;
}

/** Downscale any image to a ≤600px PNG and return raw base64 (no data:
 *  prefix) — matches the logos bucket's PNG-only rule. */
async function toPngBase64(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Could not read that image.'));
      img.src = url;
    });
    const scale = Math.min(1, 600 / img.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl.split(',')[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** True when the signed-in user is the admin. */
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = React.useState(false);
  React.useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setIsAdmin(data.session?.user.app_metadata?.role === 'admin');
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return isAdmin;
}

/** Call the admin-api (or billing-api's admin actions); surfaces
 *  server-side error messages. */
async function adminCall<T = Record<string, unknown>>(body: object, fn: 'admin-api' | 'billing-api' = 'admin-api'): Promise<T> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    // FunctionsHttpError carries the response; pull the real message out.
    try {
      const detail = await (error as { context?: Response }).context?.json();
      if (detail?.error) throw new Error(detail.error);
    } catch (inner) {
      if (inner instanceof Error && inner.message) throw inner;
    }
    throw new Error(error.message);
  }
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

interface AdminPanelProps {
  open: boolean;
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ open, onClose }) => {
  const [stats, setStats] = React.useState<AdminStats | null>(null);
  const [users, setUsers] = React.useState<AdminUser[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [practiceName, setPracticeName] = React.useState('');
  const [doctorName, setDoctorName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [tab, setTab] = React.useState<'accounts' | 'practices' | 'billing' | 'ai'>('accounts');
  // Billing tab state.
  const [billingRows, setBillingRows] = React.useState<BillingOverviewRow[] | null>(null);
  const [billingMrr, setBillingMrr] = React.useState(0);
  const [billingComped, setBillingComped] = React.useState(0);
  const [setupNote, setSetupNote] = React.useState('');
  // AI tab state.
  const [aiModel, setAiModel] = React.useState('');
  const [aiModels, setAiModels] = React.useState<Array<{ id: string; displayName: string }>>([]);
  const [aiConfigured, setAiConfigured] = React.useState(false);
  const [aiUsage, setAiUsage] = React.useState<AiUsageRow[] | null>(null);
  const [aiTotalCost, setAiTotalCost] = React.useState(0);
  const [aiBalance, setAiBalance] = React.useState<{ deepgram: string | null; note: string } | null>(null);
  const [practices, setPractices] = React.useState<AdminPractice[] | null>(null);
  const [selectedPracticeId, setSelectedPracticeId] = React.useState<string | null>(null);
  const [practiceRename, setPracticeRename] = React.useState('');
  const [memberEmail, setMemberEmail] = React.useState('');
  const logoRef = React.useRef<HTMLInputElement>(null);
  const modalRef = useModalFocus(open);

  const selected = users?.find((u) => u.id === selectedId) ?? null;
  const selectedPractice = practices?.find((p) => p.id === selectedPracticeId) ?? null;

  const refresh = React.useCallback(async () => {
    setError('');
    try {
      const [s, u, pr] = await Promise.all([
        adminCall<AdminStats>({ action: 'stats' }),
        adminCall<{ users: AdminUser[] }>({ action: 'list_users' }),
        adminCall<{ practices: AdminPractice[] }>({ action: 'list_practices' }),
      ]);
      setStats(s);
      setUsers(u.users);
      setPractices(pr.practices);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load admin data.');
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      setSelectedId(null);
      setSelectedPracticeId(null);
      setNotice('');
      refresh();
    }
  }, [open, refresh]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Auto-dismiss the result banner so it reads as a transient toast.
  React.useEffect(() => {
    if (!notice && !error) return;
    const t = setTimeout(() => { setNotice(''); setError(''); }, 4500);
    return () => clearTimeout(t);
  }, [notice, error]);

  const loadAi = React.useCallback(async () => {
    try {
      const cfg = await adminCall<{ model: string; models: Array<{ id: string; displayName: string }>; configured: boolean }>({ action: 'get_ai_config' });
      setAiModel(cfg.model);
      setAiModels(cfg.models ?? []);
      setAiConfigured(cfg.configured);
      const usage = await adminCall<{ users: AiUsageRow[]; totalEstCostUsd: number }>({ action: 'ai_usage' });
      setAiUsage(usage.users ?? []);
      setAiTotalCost(usage.totalEstCostUsd ?? 0);
      const bal = await adminCall<{ deepgram: string | null; note: string }>({ action: 'ai_balance' });
      setAiBalance(bal);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load AI settings.');
    }
  }, []);
  React.useEffect(() => {
    if (open && tab === 'ai') loadAi();
  }, [open, tab, loadAi]);

  const loadBilling = React.useCallback(async () => {
    try {
      const o = await adminCall<{ subscriptions: BillingOverviewRow[]; mrrUsd: number; compedCount: number }>(
        { action: 'admin_overview' },
        'billing-api'
      );
      setBillingRows(o.subscriptions ?? []);
      setBillingMrr(o.mrrUsd ?? 0);
      setBillingComped(o.compedCount ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load billing.');
      setBillingRows([]);
    }
  }, []);
  React.useEffect(() => {
    if (open && tab === 'billing') loadBilling();
  }, [open, tab, loadBilling]);

  if (!open) return null;

  const pick = (u: AdminUser) => {
    setSelectedId(u.id);
    setPracticeName(u.practiceName);
    setDoctorName(u.doctorName);
    setError('');
    setNotice('');
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      setNotice(label);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const handleSetPassword = () => {
    if (!selected) return;
    const pw = window.prompt(`New password for ${selected.email} (min 6 characters):`, '');
    if (pw === null) return;
    run('Password updated.', async () => {
      await adminCall({ action: 'set_password', userId: selected.id, password: pw });
    });
  };

  const handleResetLink = () => {
    if (!selected) return;
    run('Reset link copied to clipboard.', async () => {
      const { link } = await adminCall<{ link: string }>({
        action: 'reset_link',
        email: selected.email,
      });
      if (!link) throw new Error('No link returned.');
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        window.prompt('Copy the reset link:', link);
      }
    });
  };

  const handleSaveNames = () => {
    if (!selected) return;
    run('Profile updated.', async () => {
      await adminCall({
        action: 'update_profile',
        userId: selected.id,
        practiceName: practiceName.trim(),
        doctorName: doctorName.trim(),
      });
      await refresh();
    });
  };

  const handleConfirmEmail = () => {
    if (!selected) return;
    run('Email confirmed.', async () => {
      await adminCall({ action: 'confirm_email', userId: selected.id });
      await refresh();
    });
  };

  const handleRemoveLogo = () => {
    if (!selected) return;
    if (!window.confirm(`Remove the uploaded logo for ${selected.email}?`)) return;
    run('Logo removed.', async () => {
      await adminCall({ action: 'remove_logo', userId: selected.id });
      await refresh();
    });
  };

  const handleDelete = () => {
    if (!selected) return;
    const label = selected.practiceName.trim() || selected.email;
    if (!window.confirm(
      `Delete the account for ${label}? This permanently removes the account, ` +
      `its ${selected.chartCount} chart${selected.chartCount === 1 ? '' : 's'}, templates, and logo.`
    )) return;
    if (!window.confirm('This cannot be undone. Delete permanently?')) return;
    run('Account deleted.', async () => {
      await adminCall({ action: 'delete_user', userId: selected.id });
      setSelectedId(null);
      await refresh();
    });
  };

  const pickPractice = (p: AdminPractice) => {
    setSelectedPracticeId(p.id);
    setPracticeRename(p.name);
    setMemberEmail('');
    setError('');
    setNotice('');
  };

  const handleRenamePractice = () => {
    if (!selectedPractice) return;
    run('Practice renamed.', async () => {
      await adminCall({ action: 'rename_practice', practiceId: selectedPractice.id, name: practiceRename.trim() });
      await refresh();
    });
  };

  const handleDeletePractice = () => {
    if (!selectedPractice) return;
    if (!window.confirm(
      `Delete the practice "${selectedPractice.name || 'Untitled'}"? Its ${selectedPractice.chartCount} shared ` +
      `chart${selectedPractice.chartCount === 1 ? '' : 's'} become private to their creators; accounts are not deleted.`
    )) return;
    run('Practice deleted.', async () => {
      await adminCall({ action: 'delete_practice', practiceId: selectedPractice.id });
      setSelectedPracticeId(null);
      await refresh();
    });
  };

  const handleAddPracticeMember = () => {
    if (!selectedPractice || !memberEmail.trim()) return;
    run('Member added.', async () => {
      await adminCall({ action: 'practice_add_member', practiceId: selectedPractice.id, email: memberEmail.trim() });
      setMemberEmail('');
      await refresh();
    });
  };

  const handleRemovePracticeMember = (userId: string, email: string) => {
    if (!selectedPractice) return;
    if (!window.confirm(`Remove ${email} from ${selectedPractice.name || 'this practice'}?`)) return;
    run('Member removed.', async () => {
      await adminCall({ action: 'practice_remove_member', practiceId: selectedPractice.id, userId });
      await refresh();
    });
  };

  const handleResendInvite = (userId: string, email: string) => {
    if (!selectedPractice) return;
    run(`Invite re-sent to ${email}.`, async () => {
      await adminCall({
        action: 'practice_resend_invite',
        practiceId: selectedPractice.id,
        userId,
        redirectTo: window.location.origin + window.location.pathname,
      });
      await refresh();
    });
  };

  const handleSetPlan = (plan: 'basic' | 'pro') => {
    if (!selectedPractice) return;
    run(`Plan set to ${plan === 'pro' ? 'Pro' : 'Basic'}.`, async () => {
      await adminCall({ action: 'set_plan', practiceId: selectedPractice.id, plan });
      await refresh();
    });
  };

  const handleSetAccountType = (accountType: 'individual' | 'practice') => {
    if (!selectedPractice) return;
    run(`Account type set to ${accountType}.`, async () => {
      await adminCall({ action: 'set_billing', practiceId: selectedPractice.id, accountType });
      await refresh();
    });
  };

  const handleSetComped = (comped: boolean) => {
    if (!selectedPractice) return;
    if (comped && !window.confirm(`Give ${selectedPractice.name || 'this practice'} complimentary access (no subscription required)?`)) return;
    if (!comped && !window.confirm('Remove complimentary access? They will hit the plan chooser on next load.')) return;
    run(comped ? 'Comped — full access, no billing.' : 'Comp removed.', async () => {
      await adminCall({ action: 'set_billing', practiceId: selectedPractice.id, comped });
      await refresh();
    });
  };

  const handleStripeSetup = () => {
    run('Stripe setup complete.', async () => {
      const r = await adminCall<{ prices: Record<string, string>; webhookUrl: string; createdWebhook: boolean; livemode: boolean }>(
        { action: 'admin_setup' },
        'billing-api'
      );
      setSetupNote(
        `${Object.keys(r.prices).length} prices ready · webhook ${r.createdWebhook ? 'created' : 'already in place'} (${r.webhookUrl}) · ${r.livemode ? 'LIVE mode' : 'test mode'}`
      );
      await loadBilling();
    });
  };

  /** Short status chip for a practice's subscription. */
  const billingChip = (status: string) => {
    const cls =
      ['active', 'trialing', 'comped'].includes(status)
        ? 'admin-panel__billing-status admin-panel__billing-status--good'
        : status === 'past_due'
        ? 'admin-panel__billing-status admin-panel__billing-status--warn'
        : status === 'none'
        ? 'admin-panel__billing-status'
        : 'admin-panel__billing-status admin-panel__billing-status--bad';
    return <span className={cls}>{status === 'none' ? 'unbilled' : status.replace(/_/g, ' ')}</span>;
  };

  const handleSetModel = (model: string) => {
    if (!model) return;
    run('AI model updated.', async () => {
      await adminCall({ action: 'set_ai_model', model });
      setAiModel(model);
    });
  };

  const handleSetPracticeOwner = (userId: string, email: string) => {
    if (!selectedPractice) return;
    if (!window.confirm(`Make ${email} the primary owner of ${selectedPractice.name || 'this practice'}?`)) return;
    run('Owner changed.', async () => {
      await adminCall({ action: 'set_practice_owner', practiceId: selectedPractice.id, userId });
      await refresh();
    });
  };

  const handlePracticeLogoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedPractice) return;
    run('Logo updated.', async () => {
      const dataBase64 = await toPngBase64(file);
      await adminCall({ action: 'set_practice_logo', practiceId: selectedPractice.id, dataBase64 });
      await refresh();
    });
  };

  const handleRemovePracticeLogo = () => {
    if (!selectedPractice) return;
    if (!window.confirm('Remove this practice’s logo?')) return;
    run('Logo removed.', async () => {
      await adminCall({ action: 'remove_practice_logo', practiceId: selectedPractice.id });
      await refresh();
    });
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  return (
    <div className="ai-settings-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Admin panel">
      <div className="ai-settings-modal chart-library-modal admin-panel" ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>Admin panel</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="chart-library-modal__body">
          <p className="chart-library__sub">
            {stats
              ? `${stats.users} practice account${stats.users === 1 ? '' : 's'} · ${stats.charts} charts · ${stats.templates} report templates`
              : 'Loading…'}
          </p>

          <div className="admin-panel__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'accounts'}
              className={tab === 'accounts' ? 'admin-panel__tab admin-panel__tab--on' : 'admin-panel__tab'}
              onClick={() => setTab('accounts')}
            >
              Accounts{users ? ` (${users.length})` : ''}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'practices'}
              className={tab === 'practices' ? 'admin-panel__tab admin-panel__tab--on' : 'admin-panel__tab'}
              onClick={() => setTab('practices')}
            >
              Practices{practices ? ` (${practices.length})` : ''}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'billing'}
              className={tab === 'billing' ? 'admin-panel__tab admin-panel__tab--on' : 'admin-panel__tab'}
              onClick={() => setTab('billing')}
            >
              Billing
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'ai'}
              className={tab === 'ai' ? 'admin-panel__tab admin-panel__tab--on' : 'admin-panel__tab'}
              onClick={() => setTab('ai')}
            >
              AI
            </button>
          </div>

          {(error || notice) && (
            <div className="admin-panel__banner">
              {error && <div className="login-error" role="alert">{error}</div>}
              {notice && <div className="login-notice" role="status">{notice}</div>}
            </div>
          )}

          {tab === 'accounts' && users !== null && users.length > 0 && (
            <div className="chart-library__table" role="table" aria-label="Practice accounts">
              <div className="chart-library__head-row" role="row">
                <span role="columnheader">Email</span>
                <span role="columnheader">Practice</span>
                <span role="columnheader">Charts</span>
                <span role="columnheader">Last sign-in</span>
                <span role="columnheader">Flags</span>
              </div>
              <div className="chart-library__scroll">
                {users.map((u) => (
                  <div key={u.id} className="chart-library__row" role="row">
                    <button
                      type="button"
                      className={
                        u.id === selectedId
                          ? 'chart-library__row-main admin-panel__row--active'
                          : 'chart-library__row-main'
                      }
                      onClick={() => pick(u)}
                      disabled={busy}
                    >
                      <span role="cell" className="chart-library__patient">{u.email}</span>
                      <span role="cell" className="chart-library__cell">
                        {u.practiceName.trim() || '—'}
                      </span>
                      <span role="cell" className="chart-library__cell">{u.chartCount}</span>
                      <span role="cell" className="chart-library__cell">{fmt(u.lastSignInAt)}</span>
                      <span role="cell" className="chart-library__cell">
                        {[
                          u.isAdmin && 'admin',
                          !u.emailConfirmed && 'unconfirmed',
                          u.hasLogo && 'logo',
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'accounts' && selected && (
            <section className="admin-panel__actions">
              <div className="admin-panel__names">
                <label className="patient-form__label">
                  Practice name
                  <input
                    type="text"
                    className="patient-form__input"
                    value={practiceName}
                    onChange={(e) => setPracticeName(e.target.value)}
                  />
                </label>
                <label className="patient-form__label">
                  Doctor name
                  <input
                    type="text"
                    className="patient-form__input"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                  />
                </label>
                <button type="button" className="diagram-view__action" onClick={handleSaveNames} disabled={busy}>
                  Save names
                </button>
              </div>
              <div className="admin-panel__buttons">
                <button type="button" className="diagram-view__action" onClick={handleSetPassword} disabled={busy}>
                  Set password…
                </button>
                <button type="button" className="diagram-view__action" onClick={handleResetLink} disabled={busy}>
                  Copy reset link
                </button>
                {!selected.emailConfirmed && (
                  <button type="button" className="diagram-view__action" onClick={handleConfirmEmail} disabled={busy}>
                    Confirm email
                  </button>
                )}
                {selected.hasLogo && (
                  <button type="button" className="diagram-view__action" onClick={handleRemoveLogo} disabled={busy}>
                    Remove logo
                  </button>
                )}
                {!selected.isAdmin && (
                  <button
                    type="button"
                    className="diagram-view__action diagram-view__action--danger"
                    onClick={handleDelete}
                    disabled={busy}
                  >
                    Delete account…
                  </button>
                )}
              </div>
            </section>
          )}

          {tab === 'practices' && practices !== null && (
            <div className="chart-library__table" role="table" aria-label="Practices">
              <div className="chart-library__head-row admin-panel__practice-row" role="row">
                <span role="columnheader">Practice</span>
                <span role="columnheader">Owner</span>
                <span role="columnheader">Members</span>
                <span role="columnheader">Charts</span>
                <span role="columnheader">Billing</span>
              </div>
              <div className="chart-library__scroll">
                {practices.length === 0 && <div className="chart-library__empty">No practices.</div>}
                {practices.map((p) => (
                  <div key={p.id} className="chart-library__row" role="row">
                    <button
                      type="button"
                      className={
                        p.id === selectedPracticeId
                          ? 'chart-library__row-main admin-panel__practice-row admin-panel__row--active'
                          : 'chart-library__row-main admin-panel__practice-row'
                      }
                      onClick={() => pickPractice(p)}
                      disabled={busy}
                    >
                      <span role="cell" className="chart-library__patient">{p.name || 'Untitled'}</span>
                      <span role="cell" className="chart-library__cell">{p.ownerEmail}</span>
                      <span role="cell" className="chart-library__cell">{p.memberCount}</span>
                      <span role="cell" className="chart-library__cell">{p.chartCount}</span>
                      <span role="cell" className="chart-library__cell">{billingChip(p.subscriptionStatus)}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'practices' && selectedPractice && (
            <section className="admin-panel__actions">
              <div className="admin-panel__names">
                <label className="patient-form__label">
                  Practice name
                  <input
                    type="text"
                    className="patient-form__input"
                    value={practiceRename}
                    onChange={(e) => setPracticeRename(e.target.value)}
                  />
                </label>
                <button type="button" className="diagram-view__action" onClick={handleRenamePractice} disabled={busy}>
                  Rename
                </button>
              </div>

              {/* Billing overrides. Tier + account type gate features and
                  seats; Stripe-managed practices sync from the webhook, so
                  hand-edits there are only for comps and corrections. */}
              <div className="admin-panel__plan">
                <span className="patient-form__label" style={{ marginBottom: 0 }}>Plan</span>
                <div className="admin-panel__plan-toggle" role="group" aria-label="Practice plan">
                  {(['basic', 'pro'] as const).map((pl) => (
                    <button
                      key={pl}
                      type="button"
                      className={selectedPractice.plan === pl ? 'admin-panel__plan-opt admin-panel__plan-opt--on' : 'admin-panel__plan-opt'}
                      aria-pressed={selectedPractice.plan === pl}
                      onClick={() => handleSetPlan(pl)}
                      disabled={busy || selectedPractice.plan === pl}
                    >
                      {pl === 'pro' ? 'Pro' : 'Basic'}
                    </button>
                  ))}
                  <span className="admin-panel__plan-note">
                    Pro adds AI autofill and more image storage.
                  </span>
                </div>
              </div>

              <div className="admin-panel__plan">
                <span className="patient-form__label" style={{ marginBottom: 0 }}>Account type</span>
                <div className="admin-panel__plan-toggle" role="group" aria-label="Account type">
                  {(['individual', 'practice'] as const).map((at) => (
                    <button
                      key={at}
                      type="button"
                      className={selectedPractice.accountType === at ? 'admin-panel__plan-opt admin-panel__plan-opt--on' : 'admin-panel__plan-opt'}
                      aria-pressed={selectedPractice.accountType === at}
                      onClick={() => handleSetAccountType(at)}
                      disabled={busy || selectedPractice.accountType === at}
                    >
                      {at === 'practice' ? 'Practice (5 seats)' : 'Individual (1 seat)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="admin-panel__plan">
                <span className="patient-form__label" style={{ marginBottom: 0 }}>Subscription</span>
                <div className="admin-panel__plan-toggle">
                  {billingChip(selectedPractice.subscriptionStatus)}
                  {selectedPractice.periodEnd && (
                    <span className="admin-panel__plan-note">
                      {selectedPractice.subscriptionStatus === 'trialing' ? 'trial ends' : 'renews'}{' '}
                      {new Date(selectedPractice.periodEnd).toLocaleDateString()}
                    </span>
                  )}
                  {selectedPractice.frozenAt && (
                    <span className="admin-panel__plan-note">
                      frozen — purge deletes it{' '}
                      {new Date(new Date(selectedPractice.frozenAt).getTime() + 30 * 86400000).toLocaleDateString()}
                    </span>
                  )}
                  {selectedPractice.hasStripe ? (
                    <span className="admin-panel__plan-note">Stripe-managed — status syncs from the webhook.</span>
                  ) : (
                    <button
                      type="button"
                      className="admin-panel__plan-opt"
                      onClick={() => handleSetComped(selectedPractice.subscriptionStatus !== 'comped')}
                      disabled={busy}
                    >
                      {selectedPractice.subscriptionStatus === 'comped' ? 'Remove comp' : 'Comp (free access)'}
                    </button>
                  )}
                </div>
              </div>

              {/* Practice logo (the primary owner's logo — the brand on
                  their charts). */}
              <div className="practice-logo-row">
                {selectedPractice.logoUrl ? (
                  <img src={selectedPractice.logoUrl} alt="Practice logo" className="practice-logo-preview" />
                ) : (
                  <span className="practice-logo-empty">No practice logo.</span>
                )}
                <div className="practice-logo-actions">
                  <button type="button" className="diagram-view__action" onClick={() => logoRef.current?.click()} disabled={busy}>
                    {selectedPractice.logoUrl ? 'Replace logo' : 'Upload logo'}
                  </button>
                  {selectedPractice.logoUrl && (
                    <button type="button" className="diagram-view__action diagram-view__action--danger" onClick={handleRemovePracticeLogo} disabled={busy}>
                      Remove logo
                    </button>
                  )}
                </div>
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={handlePracticeLogoPick}
                />
              </div>

              <ul className="team__members">
                {selectedPractice.members.map((m) => (
                  <li key={m.userId} className="team__member">
                    <span className="team__member-id"><strong>{m.email}</strong></span>
                    {m.pending && <span className="team__badge team__badge--pending">Pending invite</span>}
                    <span className="team__member-role">{m.isPrimaryOwner ? 'Primary owner' : m.role}</span>
                    <span className="team__member-actions">
                      {m.pending && (
                        <button
                          type="button"
                          className="diagram-view__action"
                          onClick={() => handleResendInvite(m.userId, m.email)}
                          disabled={busy}
                        >
                          Resend invite
                        </button>
                      )}
                      {!m.isPrimaryOwner && (
                        <button
                          type="button"
                          className="diagram-view__action"
                          onClick={() => handleSetPracticeOwner(m.userId, m.email)}
                          disabled={busy}
                        >
                          Make owner
                        </button>
                      )}
                      {!m.isPrimaryOwner && (
                        <button
                          type="button"
                          className="diagram-view__action diagram-view__action--danger"
                          onClick={() => handleRemovePracticeMember(m.userId, m.email)}
                          disabled={busy}
                        >
                          Remove
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="practice-team__add">
                <input
                  type="email"
                  className="patient-form__input"
                  placeholder="Add member by email"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                />
                <button type="button" className="diagram-view__action" onClick={handleAddPracticeMember} disabled={busy || !memberEmail.trim()}>
                  Add
                </button>
              </div>

              <div className="admin-panel__buttons">
                <button
                  type="button"
                  className="diagram-view__action diagram-view__action--danger"
                  onClick={handleDeletePractice}
                  disabled={busy}
                >
                  Delete practice…
                </button>
              </div>
            </section>
          )}

          {tab === 'billing' && (
            <section className="admin-panel__billing">
              <div className="admin-panel__ai-block">
                <h3 className="ai-settings-subhead">Stripe</h3>
                <p className="admin-panel__ai-total">
                  Monthly recurring revenue: <strong>${billingMrr.toFixed(2)}</strong>
                  {billingComped > 0 && <> · {billingComped} comped practice{billingComped === 1 ? '' : 's'}</>}
                </p>
                <div className="practice-logo-actions">
                  <button type="button" className="diagram-view__action" onClick={handleStripeSetup} disabled={busy}>
                    Run Stripe setup
                  </button>
                  <button type="button" className="diagram-view__action" onClick={loadBilling} disabled={busy}>
                    Refresh
                  </button>
                </div>
                {setupNote && <p className="patient-form__hint">{setupNote}</p>}
                <p className="patient-form__hint">
                  Setup is idempotent: it creates the four plan prices (by lookup key) and the webhook endpoint in
                  Stripe if they don't exist yet. Run it once per Stripe account (and again after switching test → live keys).
                </p>
              </div>

              <div className="admin-panel__ai-block">
                <h3 className="ai-settings-subhead">Subscriptions</h3>
                {billingRows === null ? (
                  <p className="chart-library__empty">Loading…</p>
                ) : billingRows.length === 0 ? (
                  <p className="practice-logo-empty">No Stripe subscriptions yet.</p>
                ) : (
                  <table className="admin-panel__usage-table">
                    <thead>
                      <tr>
                        <th>Practice</th><th>Plan</th><th>Status</th><th>$/mo</th><th>Renews</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billingRows.map((r, i) => (
                        <tr key={i}>
                          <td>{r.practiceName}</td>
                          <td>{r.planKey.replace(/_/g, ' ') || '—'}</td>
                          <td>
                            {r.status.replace(/_/g, ' ')}
                            {r.cancelAtPeriodEnd ? ' (canceling)' : ''}
                          </td>
                          <td>${r.amountUsd.toFixed(0)}</td>
                          <td>{r.periodEnd ? new Date(r.periodEnd).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}

          {tab === 'ai' && (
            <section className="admin-panel__ai">
              {/* Model — chosen live from what the account can use. */}
              <div className="admin-panel__ai-block">
                <h3 className="ai-settings-subhead">Extraction model</h3>
                {!aiConfigured && (
                  <p className="login-error" role="alert">
                    ANTHROPIC_API_KEY isn't set as an edge-function secret yet — AI autofill is off until it is.
                  </p>
                )}
                <label className="patient-form__label">
                  Model used for voice autofill
                  <select
                    className="patient-form__input"
                    value={aiModel}
                    onChange={(e) => handleSetModel(e.target.value)}
                    disabled={busy || aiModels.length === 0}
                  >
                    {aiModels.length === 0 && <option value={aiModel}>{aiModel || '—'}</option>}
                    {aiModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.displayName}</option>
                    ))}
                  </select>
                </label>
                <p className="patient-form__hint">Applies to every practice. Faster models (Haiku/Sonnet) cost less per call.</p>
              </div>

              {/* Credit / balance. */}
              <div className="admin-panel__ai-block">
                <h3 className="ai-settings-subhead">AI spend</h3>
                <p className="admin-panel__ai-total">
                  Estimated Claude spend to date: <strong>${aiTotalCost.toFixed(2)}</strong>
                </p>
                {aiBalance?.deepgram && (
                  <p className="admin-panel__ai-total">Deepgram balance: <strong>{aiBalance.deepgram}</strong></p>
                )}
                {aiBalance?.note && <p className="patient-form__hint">{aiBalance.note}</p>}
              </div>

              {/* Per-user usage. */}
              <div className="admin-panel__ai-block">
                <h3 className="ai-settings-subhead">Token usage by user</h3>
                {aiUsage === null ? (
                  <p className="chart-library__empty">Loading…</p>
                ) : aiUsage.length === 0 ? (
                  <p className="practice-logo-empty">No AI usage recorded yet.</p>
                ) : (
                  <table className="admin-panel__usage-table">
                    <thead>
                      <tr>
                        <th>User</th><th>Calls</th><th>Input</th><th>Output</th><th>Cache</th><th>Est. cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiUsage.map((u) => (
                        <tr key={u.userId}>
                          <td>{u.email}</td>
                          <td>{u.calls.toLocaleString()}</td>
                          <td>{u.inputTokens.toLocaleString()}</td>
                          <td>{u.outputTokens.toLocaleString()}</td>
                          <td>{u.cacheReadTokens.toLocaleString()}</td>
                          <td>${u.estCostUsd.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
