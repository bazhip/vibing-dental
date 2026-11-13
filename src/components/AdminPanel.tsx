import React from 'react';
import { AdminChartViewer } from './AdminChartViewer';
import { AdminChartList, type AdminChartMeta } from './AdminChartList';
import { SortButton, dateValue, sortRows, useTableSort, type SortState } from '../utils/tableSort';
import { AI_MODEL_CHOICES } from '../constants/aiModels';
import { FREE_BETA, FREE_BETA_SEATS } from '../constants/plans';
import { PLAN_LIMITS } from '../hooks/useProfile';

/** Subscription states that unlock the stored plan (matches useProfile). */
const PAID_STATUSES = ['active', 'trialing', 'comped', 'past_due'];
import { supabase } from '../utils/supabaseClient';
import { emailLinkOrigin } from '../native/authReturn';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { confirmDialog, friendlyError, promptDialog } from './ui/dialogs';
import './Login.css';
import './AccountSurfaces.css';

const MIN_PASSWORD = 8;

/** Case-insensitive "does any of these contain the query". */
const matches = (q: string, ...fields: Array<string | null | undefined>) =>
  !q || fields.some((f) => !!f && f.toLowerCase().includes(q));

/** "Primary owner" / "Owner" / "Member" — never the raw role key. */
const roleLabel = (role: string, isPrimaryOwner: boolean) =>
  isPrimaryOwner ? 'Primary owner' : role === 'owner' ? 'Owner' : 'Member';

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
  /** Last time the app was opened while signed in (profiles.last_seen_at)
   *  — absent/null before that's been recorded. */
  lastSeenAt?: string | null;
  emailConfirmed: boolean;
  isAdmin: boolean;
  practiceName: string;
  doctorName: string;
  hasLogo: boolean;
  chartCount: number;
  /** The practice they're actually a member of (authoritative — invited
   *  members have an empty profile practiceName). */
  teamPractice: string;
  teamRole: string;
}

/** When the account was last active: the later of opening the app and
 *  signing in (sign-in alone goes stale for people who stay signed in). */
export function lastActiveAt(u: Pick<AdminUser, 'lastSignInAt' | 'lastSeenAt'>): string | null {
  const a = u.lastSeenAt ? Date.parse(u.lastSeenAt) : NaN;
  const b = u.lastSignInAt ? Date.parse(u.lastSignInAt) : NaN;
  if (Number.isNaN(a) && Number.isNaN(b)) return null;
  if (Number.isNaN(a)) return u.lastSignInAt;
  if (Number.isNaN(b)) return u.lastSeenAt ?? null;
  return a >= b ? (u.lastSeenAt ?? null) : u.lastSignInAt;
}

type AccountSortKey = 'email' | 'practice' | 'charts' | 'signedUp' | 'active' | 'flags';

const accountPractice = (u: AdminUser) => u.teamPractice || u.practiceName.trim();
const accountFlags = (u: AdminUser) =>
  [
    u.isAdmin && 'admin',
    // An unconfirmed team member is a pending invite, not a
    // half-finished signup.
    !u.emailConfirmed && (u.teamPractice ? 'pending invite' : 'unconfirmed'),
    u.hasLogo && 'custom logo',
  ]
    .filter(Boolean)
    .join(' · ');

/** Sort accounts by a column. Blanks (no practice, never active, no
 *  flags) always sink to the bottom, whichever direction. */
export function sortAccounts(users: AdminUser[], key: AccountSortKey, dir: 'asc' | 'desc'): AdminUser[] {
  return sortRows(
    users,
    { key, dir },
    (u, k) => {
      switch (k) {
        case 'email': return u.email.toLowerCase();
        case 'practice': return accountPractice(u).toLowerCase() || null;
        case 'charts': return u.chartCount;
        case 'signedUp': return dateValue(u.createdAt);
        case 'active': return dateValue(lastActiveAt(u));
        case 'flags': return accountFlags(u) || null;
      }
    },
    (x, y) => x.email.localeCompare(y.email),
  );
}

type PracticeSortKey = 'name' | 'owner' | 'members' | 'charts' | 'billing';

/** Sort practices by a column (blanks last); ties fall back to name. */
export function sortPractices(list: AdminPractice[], sort: SortState<PracticeSortKey>): AdminPractice[] {
  return sortRows(
    list,
    sort,
    (p, k) => {
      switch (k) {
        case 'name': return p.name.trim().toLowerCase() || null;
        case 'owner': return p.ownerEmail.toLowerCase() || null;
        case 'members': return p.memberCount;
        case 'charts': return p.chartCount;
        case 'billing': return p.subscriptionStatus || null;
      }
    },
    (a, b) => a.name.localeCompare(b.name),
  );
}

type BillingSortKey = 'practice' | 'plan' | 'status' | 'amount' | 'renews';
type AiSortKey = 'user' | 'calls' | 'input' | 'output' | 'cache' | 'cost';

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
  /** Feature flag: owner-facing report PDF (beta). Absent until the
   *  admin-api's list_practices includes it — treated as off. */
  ownerReportEnabled?: boolean;
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
  const [billingTax, setBillingTax] = React.useState<boolean | null>(null);
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
  const [query, setQuery] = React.useState('');
  // Accounts table sort — most recently active first by default.
  const [accountSort, setAccountSort] = React.useState<{ key: AccountSortKey; dir: 'asc' | 'desc' }>({
    key: 'active',
    dir: 'desc',
  });
  const sortBy = (key: AccountSortKey) =>
    setAccountSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
        // Numbers and dates read best biggest/newest first; text A→Z.
        : { key, dir: key === 'charts' || key === 'active' || key === 'signedUp' ? 'desc' : 'asc' }
    );
  const accountHeader = (key: AccountSortKey, label: string) => (
    <span
      role="columnheader"
      aria-sort={accountSort.key === key ? (accountSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <SortButton label={label} active={accountSort.key === key} dir={accountSort.dir} onClick={() => sortBy(key)} />
    </span>
  );
  const practiceHeader = (key: PracticeSortKey, label: string) => (
    <span role="columnheader" aria-sort={practiceSort.ariaSort(key)}>
      <SortButton label={label} active={practiceSort.sort.key === key} dir={practiceSort.sort.dir} onClick={() => practiceSort.toggle(key)} />
    </span>
  );
  const logoRef = React.useRef<HTMLInputElement>(null);
  const modalRef = useModalFocus(open);

  const selected = users?.find((u) => u.id === selectedId) ?? null;
  const selectedPractice = practices?.find((p) => p.id === selectedPracticeId) ?? null;

  // Admin chart viewer: a practice's or an account's charts (loaded on
  // demand) and the one being viewed. view_chart logs every open
  // server-side. `subject` is "practice:<id>" or "user:<id>" so switching
  // selection never shows the previous subject's list.
  const [chartList, setChartList] = React.useState<{ subject: string; rows: AdminChartMeta[] } | null>(null);
  const [chartsLoading, setChartsLoading] = React.useState(false);
  const [viewingChart, setViewingChart] = React.useState<{ data: unknown; practiceName: string } | null>(null);
  const loadCharts = async (subject: string, body: { action: 'list_practice_charts'; practiceId: string } | { action: 'list_user_charts'; userId: string }) => {
    setChartsLoading(true);
    try {
      const r = await adminCall<{ charts: AdminChartMeta[] }>(body);
      setChartList({ subject, rows: r.charts ?? [] });
    } catch (err) {
      setError(friendlyError(err, 'Could not load charts.'));
    } finally {
      setChartsLoading(false);
    }
  };
  const chartRowsFor = (subject: string) => (chartList?.subject === subject ? chartList.rows : null);

  // Table sorts (Accounts lives above; these are the other tabs).
  const practiceSort = useTableSort<PracticeSortKey>({ key: 'name', dir: 'asc' }, ['members', 'charts']);
  const billingSort = useTableSort<BillingSortKey>({ key: 'practice', dir: 'asc' }, ['amount']);
  const aiSort = useTableSort<AiSortKey>({ key: 'cost', dir: 'desc' }, ['calls', 'input', 'output', 'cache', 'cost']);
  /** A sortable <th> for the plain HTML tables (billing, AI usage). */
  const th = <K extends string>(s: ReturnType<typeof useTableSort<K>>, key: K, label: string) => (
    <th key={key} aria-sort={s.ariaSort(key)}>
      <SortButton className="admin-panel__th-sort" label={label} active={s.sort.key === key} dir={s.sort.dir} onClick={() => s.toggle(key)} />
    </th>
  );
  const openChart = async (chartId: string, practiceName: string) => {
    try {
      const r = await adminCall<{ chart: { data: unknown } }>({ action: 'view_chart', chartId });
      setViewingChart({ data: r.chart.data, practiceName });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const refresh = React.useCallback(async () => {
    setError('');
    // Each section renders as soon as its own data lands — the Accounts
    // list used to wait on the (much slower) practices listing.
    const fail = (e: unknown) => setError(friendlyError(e, 'Could not load admin data.'));
    await Promise.all([
      adminCall<AdminStats>({ action: 'stats' }).then(setStats, fail),
      adminCall<{ users: AdminUser[] }>({ action: 'list_users' }).then((u) => setUsers(u.users), fail),
      adminCall<{ practices: AdminPractice[] }>({ action: 'list_practices' }).then((pr) => setPractices(pr.practices), fail),
    ]);
  }, []);

  React.useEffect(() => {
    if (open) {
      setSelectedId(null);
      setSelectedPracticeId(null);
      setNotice('');
      setQuery('');
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

  // Success notices fade on their own; errors stay until dismissed (or
  // the next action), so a failure can't vanish before it's read.
  React.useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  const backdrop = useBackdropDismiss(onClose);

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
      setError(friendlyError(e, 'Could not load AI settings.'));
    }
  }, []);
  React.useEffect(() => {
    if (open && tab === 'ai') loadAi();
  }, [open, tab, loadAi]);

  const loadBilling = React.useCallback(async () => {
    try {
      const o = await adminCall<{ subscriptions: BillingOverviewRow[]; mrrUsd: number; compedCount: number; taxEnabled?: boolean }>(
        { action: 'admin_overview' },
        'billing-api'
      );
      setBillingRows(o.subscriptions ?? []);
      setBillingMrr(o.mrrUsd ?? 0);
      setBillingComped(o.compedCount ?? 0);
      setBillingTax(typeof o.taxEnabled === 'boolean' ? o.taxEnabled : null);
    } catch (e) {
      setError(friendlyError(e, 'Could not load billing.'));
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

  /** Run an admin action; shows `label` on success (none when null). */
  const run = async (label: string | null, fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      if (label) setNotice(label);
      return true;
    } catch (e) {
      setError(friendlyError(e, 'That didn’t work. Please try again.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleSetPassword = async () => {
    if (!selected) return;
    const pw = await promptDialog({
      title: `Set a new password for ${selected.email}`,
      message: 'They’ll sign in with this password from now on. Share it with them securely.',
      label: 'New password',
      type: 'password',
      placeholder: `At least ${MIN_PASSWORD} characters`,
      confirmLabel: 'Set password',
      validate: (v) => (v.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.` : null),
    });
    if (pw === null) return;
    run('Password updated.', async () => {
      await adminCall({ action: 'set_password', userId: selected.id, password: pw });
    });
  };

  const handleResetLink = async () => {
    if (!selected) return;
    let link = '';
    const ok = await run(null, async () => {
      const res = await adminCall<{ link: string }>({
        action: 'reset_link',
        email: selected.email,
      });
      if (!res.link) throw new Error('The server didn’t return a reset link.');
      link = res.link;
    });
    if (!ok) return;
    const copied = await promptDialog({
      title: 'Password reset link',
      message: `Send this to ${selected.email}. It signs them in once so they can choose a new password.`,
      label: 'Reset link',
      defaultValue: link,
      readOnly: true,
      confirmLabel: 'Copy link',
    });
    if (copied !== null) setNotice('Reset link copied to the clipboard.');
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

  const handleRemoveLogo = async () => {
    if (!selected) return;
    const ok = await confirmDialog({
      title: `Remove the logo for ${selected.email}?`,
      message: 'Their charts fall back to the template’s built-in mark.',
      confirmLabel: 'Remove logo',
      danger: true,
    });
    if (!ok) return;
    run('Logo removed.', async () => {
      await adminCall({ action: 'remove_logo', userId: selected.id });
      await refresh();
    });
  };

  const handleDelete = async () => {
    if (!selected) return;
    const label = selected.practiceName.trim() || selected.email;
    const ok = await confirmDialog({
      title: `Permanently delete ${selected.email}?`,
      message:
        `This removes the user${label !== selected.email ? ` (${label})` : ''}, ` +
        `their ${selected.chartCount} chart${selected.chartCount === 1 ? '' : 's'}, templates, and logo. ` +
        'This cannot be undone.',
      confirmLabel: 'Delete permanently',
      danger: true,
    });
    if (!ok) return;
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

  const handleRenamePractice = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedPractice || busy) return;
    run('Practice renamed.', async () => {
      await adminCall({ action: 'rename_practice', practiceId: selectedPractice.id, name: practiceRename.trim() });
      await refresh();
    });
  };

  const handleDeletePractice = async () => {
    if (!selectedPractice) return;
    const ok = await confirmDialog({
      title: `Delete the practice “${selectedPractice.name || 'Untitled'}”?`,
      message:
        `Its ${selectedPractice.chartCount} shared chart${selectedPractice.chartCount === 1 ? '' : 's'} ` +
        'become private to whoever created them. Users are not deleted.',
      confirmLabel: 'Delete practice',
      danger: true,
    });
    if (!ok) return;
    run('Practice deleted.', async () => {
      await adminCall({ action: 'delete_practice', practiceId: selectedPractice.id });
      setSelectedPracticeId(null);
      await refresh();
    });
  };

  const handleAddPracticeMember = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedPractice || !memberEmail.trim() || busy) return;
    run('Member added.', async () => {
      await adminCall({ action: 'practice_add_member', practiceId: selectedPractice.id, email: memberEmail.trim() });
      setMemberEmail('');
      await refresh();
    });
  };

  const handleRemovePracticeMember = async (userId: string, email: string) => {
    if (!selectedPractice) return;
    const ok = await confirmDialog({
      title: `Remove ${email} from ${selectedPractice.name || 'this practice'}?`,
      message: 'They lose access to the practice’s shared charts but keep their own.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
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
        redirectTo: emailLinkOrigin(),
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

  const handleSetOwnerReport = (enabled: boolean) => {
    if (!selectedPractice) return;
    run(enabled ? 'Owner report enabled for this practice.' : 'Owner report disabled.', async () => {
      await adminCall({
        action: 'set_feature',
        practiceId: selectedPractice.id,
        feature: 'owner_report',
        enabled,
      });
      await refresh();
    });
  };

  const handleSetComped = async (comped: boolean) => {
    if (!selectedPractice) return;
    const name = selectedPractice.name || 'this practice';
    const ok = await confirmDialog(
      comped
        ? {
            title: `Give ${name} complimentary access?`,
            message: 'Full access with no subscription required.',
            confirmLabel: 'Comp practice',
          }
        : {
            title: `Remove complimentary access for ${name}?`,
            message: 'They’ll be asked to pick a plan the next time they load the app.',
            confirmLabel: 'Remove comp',
            danger: true,
          }
    );
    if (!ok) return;
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

  const handleSetPracticeOwner = async (userId: string, email: string) => {
    if (!selectedPractice) return;
    const ok = await confirmDialog({
      title: `Make ${email} the primary owner of ${selectedPractice.name || 'this practice'}?`,
      message: 'The primary owner holds billing and the practice name.',
      confirmLabel: 'Make primary owner',
    });
    if (!ok) return;
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

  const handleRemovePracticeLogo = async () => {
    if (!selectedPractice) return;
    const ok = await confirmDialog({
      title: 'Remove this practice’s logo?',
      message: 'Their charts fall back to the template’s built-in mark.',
      confirmLabel: 'Remove logo',
      danger: true,
    });
    if (!ok) return;
    run('Logo removed.', async () => {
      await adminCall({ action: 'remove_practice_logo', practiceId: selectedPractice.id });
      await refresh();
    });
  };

  const q = query.trim().toLowerCase();
  const filteredUsers = sortAccounts(
    (users ?? []).filter((u) => matches(q, u.email, u.practiceName, u.doctorName, u.teamPractice)),
    accountSort.key,
    accountSort.dir
  );
  const filteredPractices = sortPractices(
    (practices ?? []).filter((p) => matches(q, p.name, p.ownerEmail, ...p.members.map((m) => m.email))),
    practiceSort.sort
  );
  const sortedBilling = sortRows(billingRows ?? [], billingSort.sort, (r, k) => {
    switch (k) {
      case 'practice': return r.practiceName.toLowerCase() || null;
      case 'plan': return r.planKey || null;
      case 'status': return r.status || null;
      case 'amount': return r.amountUsd;
      case 'renews': return dateValue(r.periodEnd);
    }
  });
  const sortedAi = sortRows(aiUsage ?? [], aiSort.sort, (u, k) => {
    switch (k) {
      case 'user': return u.email.toLowerCase() || null;
      case 'calls': return u.calls;
      case 'input': return u.inputTokens;
      case 'output': return u.outputTokens;
      case 'cache': return u.cacheReadTokens;
      case 'cost': return u.estCostUsd;
    }
  }, (a, b) => a.email.localeCompare(b.email));

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  return (
    <div className="ai-settings-overlay" {...backdrop} role="dialog" aria-modal="true" aria-label="Admin panel">
      <div className="ai-settings-modal chart-library-modal admin-panel" ref={modalRef} tabIndex={-1}>
        <header className="ai-settings-header">
          <h2>Admin panel</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="chart-library-modal__body">
          <p className="chart-library__sub">
            {stats
              ? `${stats.users} user${stats.users === 1 ? '' : 's'} · ${stats.charts} chart${stats.charts === 1 ? '' : 's'} · ${stats.templates} report template${stats.templates === 1 ? '' : 's'}`
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
              {error && (
                <div className="login-error" role="alert">
                  <span>{error}</span>
                  <button type="button" className="admin-panel__banner-dismiss" onClick={() => setError('')} aria-label="Dismiss error">
                    ×
                  </button>
                </div>
              )}
              {notice && (
                <div className="login-notice" role="status">
                  <span>{notice}</span>
                  <button type="button" className="admin-panel__banner-dismiss" onClick={() => setNotice('')} aria-label="Dismiss">
                    ×
                  </button>
                </div>
              )}
            </div>
          )}

          {(tab === 'accounts' || tab === 'practices') && (
            <div className="admin-panel__search">
              <input
                type="search"
                className="patient-form__input"
                aria-label={tab === 'accounts' ? 'Search users' : 'Search practices'}
                placeholder={tab === 'accounts' ? 'Search users by email or name' : 'Search practices by name or email'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}

          {tab === 'accounts' && users === null && (
            <div className="chart-library__empty">
              {error ? (
                <>
                  Couldn’t load users.{' '}
                  <button type="button" className="diagram-view__action" onClick={() => void refresh()} disabled={busy}>
                    Retry
                  </button>
                </>
              ) : (
                'Loading users…'
              )}
            </div>
          )}
          {tab === 'accounts' && users !== null && users.length === 0 && (
            <div className="chart-library__empty">No users yet.</div>
          )}
          {tab === 'accounts' && users !== null && users.length > 0 && filteredUsers.length === 0 && (
            <div className="chart-library__empty">No users match “{query.trim()}”.</div>
          )}

          {tab === 'accounts' && filteredUsers.length > 0 && (
            <div className="chart-library__table" role="table" aria-label="Users">
              <div className="chart-library__head-row admin-panel__account-row" role="row">
                {accountHeader('email', 'Email')}
                {accountHeader('practice', 'Practice')}
                {accountHeader('charts', 'Charts')}
                {accountHeader('signedUp', 'Signed up')}
                {accountHeader('active', 'Last active')}
                {accountHeader('flags', 'Flags')}
              </div>
              <div className="chart-library__scroll">
                {filteredUsers.map((u) => (
                  <div key={u.id} className="chart-library__row" role="row">
                    <button
                      type="button"
                      className={
                        u.id === selectedId
                          ? 'chart-library__row-main admin-panel__account-row admin-panel__row--active'
                          : 'chart-library__row-main admin-panel__account-row'
                      }
                      onClick={() => pick(u)}
                      disabled={busy}
                    >
                      <span role="cell" className="chart-library__patient">{u.email}</span>
                      <span role="cell" className="chart-library__cell">
                        {accountPractice(u) || '—'}
                      </span>
                      <span role="cell" className="chart-library__cell">{u.chartCount}</span>
                      <span role="cell" className="chart-library__cell" title={fmt(u.createdAt)}>
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
                      </span>
                      <span
                        role="cell"
                        className="chart-library__cell"
                        title={`Last used the app: ${fmt(u.lastSeenAt ?? null)}\nLast signed in: ${fmt(u.lastSignInAt)}`}
                      >
                        {fmt(lastActiveAt(u))}
                      </span>
                      <span role="cell" className="chart-library__cell">
                        {accountFlags(u) || '—'}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'accounts' && selected && (
            <section className="admin-panel__actions">
              {selected.teamPractice && (
                <p className="patient-form__hint" style={{ margin: 0 }}>
                  {selected.teamRole === 'owner' ? 'Owner' : 'Member'} of <strong>{selected.teamPractice}</strong>
                  {!selected.emailConfirmed && ' (invite pending)'} — membership, roles, and billing live in the
                  Practices tab.
                </p>
              )}
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
              <AdminChartList
                key={`user:${selected.id}`}
                label={`Charts created by ${selected.email}`}
                rows={chartRowsFor(`user:${selected.id}`)}
                loading={chartsLoading}
                onLoad={() => loadCharts(`user:${selected.id}`, { action: 'list_user_charts', userId: selected.id })}
                onOpen={(id) => openChart(id, accountPractice(selected) || selected.email)}
                emptyText="This account hasn’t created any charts."
              />
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

          {tab === 'practices' && practices === null && (
            <div className="chart-library__empty">
              {error ? (
                <>
                  Couldn’t load practices.{' '}
                  <button type="button" className="diagram-view__action" onClick={() => void refresh()} disabled={busy}>
                    Retry
                  </button>
                </>
              ) : (
                'Loading practices…'
              )}
            </div>
          )}

          {tab === 'practices' && practices !== null && (
            <div className="chart-library__table" role="table" aria-label="Practices">
              <div className="chart-library__head-row admin-panel__practice-row" role="row">
                {practiceHeader('name', 'Practice')}
                {practiceHeader('owner', 'Owner')}
                {practiceHeader('members', 'Members')}
                {practiceHeader('charts', 'Charts')}
                {practiceHeader('billing', 'Billing')}
              </div>
              <div className="chart-library__scroll">
                {practices.length === 0 && <div className="chart-library__empty">No practices yet.</div>}
                {practices.length > 0 && filteredPractices.length === 0 && (
                  <div className="chart-library__empty">No practices match “{query.trim()}”.</div>
                )}
                {filteredPractices.map((p) => (
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
              <form className="admin-panel__names" onSubmit={handleRenamePractice}>
                <label className="patient-form__label">
                  Practice name
                  <input
                    type="text"
                    className="patient-form__input"
                    value={practiceRename}
                    onChange={(e) => setPracticeRename(e.target.value)}
                  />
                </label>
                <button type="submit" className="diagram-view__action" disabled={busy}>
                  Rename
                </button>
              </form>

              {/* What this account can actually do right now — resolved the
                  same way the app does (useProfile + PLAN_LIMITS). */}
              {(() => {
                const paid = PAID_STATUSES.includes(selectedPractice.subscriptionStatus);
                const tier = paid ? selectedPractice.plan : 'free';
                const limits = PLAN_LIMITS[tier];
                const seats = FREE_BETA ? FREE_BETA_SEATS : selectedPractice.accountType === 'practice' ? 5 : 1;
                const ownerReport = FREE_BETA || !!selectedPractice.ownerReportEnabled;
                return (
                  <div className="admin-panel__access" aria-label="Effective access">
                    <span className="patient-form__label" style={{ marginBottom: 0 }}>Access</span>
                    <div className="admin-panel__access-body">
                      <strong>
                        {paid
                          ? `${tier === 'pro' ? 'Pro' : 'Basic'} (${selectedPractice.subscriptionStatus})`
                          : FREE_BETA ? 'Free beta' : 'Free'}
                      </strong>
                      <span>AI dictation {limits.aiAutofill ? '✓' : '✗'}</span>
                      <span>{limits.maxImages} images / chart</span>
                      <span>{seats} {seats === 1 ? 'seat' : 'seats'}</span>
                      <span>Owner report {ownerReport ? '✓' : '✗'}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Billing overrides. Tier + account type set images and
                  seats once an account is billed or comped; Stripe-managed
                  practices sync from the webhook, so hand-edits there are
                  only for comps and corrections. */}
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
                    Applies once billed or comped: Basic {PLAN_LIMITS.basic.maxImages} images/chart, Pro {PLAN_LIMITS.pro.maxImages}.
                    Unbilled accounts are on the free tier ({PLAN_LIMITS.free.maxImages} images). AI dictation is on for every plan.
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
                  {FREE_BETA && (
                    <span className="admin-panel__plan-note">
                      Not enforced during the free beta — every account gets {FREE_BETA_SEATS} seats.
                    </span>
                  )}
                </div>
              </div>

              <div className="admin-panel__plan">
                <span className="patient-form__label" style={{ marginBottom: 0 }}>Features</span>
                <div className="admin-panel__plan-toggle" role="group" aria-label="Feature flags">
                  <button
                    type="button"
                    className={selectedPractice.ownerReportEnabled ? 'admin-panel__plan-opt admin-panel__plan-opt--on' : 'admin-panel__plan-opt'}
                    aria-pressed={!!selectedPractice.ownerReportEnabled}
                    onClick={() => handleSetOwnerReport(!selectedPractice.ownerReportEnabled)}
                    disabled={busy}
                  >
                    Owner report: {selectedPractice.ownerReportEnabled ? 'on' : 'off'}
                  </button>
                  <span className="admin-panel__plan-note">
                    {FREE_BETA
                      ? 'Owner-facing take-home PDF — on for everyone during the free beta; this switch takes over when the beta ends.'
                      : 'Owner-facing take-home PDF (beta) — off by default for every practice.'}
                  </span>
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
                    <span className="team__member-role">{roleLabel(m.role, m.isPrimaryOwner)}</span>
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
                      {/* A pending invite can't own the practice yet. */}
                      {!m.isPrimaryOwner && !m.pending && (
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

              <form className="practice-team__add" onSubmit={handleAddPracticeMember}>
                <input
                  type="email"
                  className="patient-form__input"
                  placeholder="Add member by email"
                  aria-label="Add member by email"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                />
                <button type="submit" className="diagram-view__action" disabled={busy || !memberEmail.trim()}>
                  Add
                </button>
              </form>

              <AdminChartList
                key={`practice:${selectedPractice.id}`}
                label={`Charts in ${selectedPractice.name || 'this practice'}`}
                rows={chartRowsFor(`practice:${selectedPractice.id}`)}
                loading={chartsLoading}
                onLoad={() => loadCharts(`practice:${selectedPractice.id}`, { action: 'list_practice_charts', practiceId: selectedPractice.id })}
                onOpen={(id) => openChart(id, selectedPractice.name || 'Untitled practice')}
                emptyText="No charts in this practice."
              />

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
                {billingTax !== null && (
                  <p className="admin-panel__ai-total">
                    Stripe Tax: <strong>{billingTax ? 'on' : 'off'}</strong>
                    {!billingTax && (
                      <span className="patient-form__hint">
                        Checkout collects billing addresses and VAT/tax IDs but adds no tax. To turn it on, activate
                        Stripe Tax in the Stripe Dashboard, then set the STRIPE_TAX_ENABLED=true function secret.
                      </span>
                    )}
                  </p>
                )}
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
                        {th(billingSort, 'practice', 'Practice')}
                        {th(billingSort, 'plan', 'Plan')}
                        {th(billingSort, 'status', 'Status')}
                        {th(billingSort, 'amount', '$/mo')}
                        {th(billingSort, 'renews', 'Renews')}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedBilling.map((r, i) => (
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
                    disabled={busy || !aiConfigured}
                  >
                    {aiModel && !AI_MODEL_CHOICES.some((c) => c.id === aiModel) && (
                      <option value={aiModel}>{aiModel} (current — not tuned)</option>
                    )}
                    {AI_MODEL_CHOICES.map((c) => {
                      // Grey out models this API key can't use (when the
                      // live list loaded at all).
                      const unavailable = aiModels.length > 0 && !aiModels.some((m) => m.id === c.id);
                      return (
                        <option key={c.id} value={c.id} disabled={unavailable}>
                          {c.label} — {c.speed}, {c.costPerHour}{unavailable ? ' (not on this account)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <p className="patient-form__hint">
                  {AI_MODEL_CHOICES.find((c) => c.id === aiModel)?.note ?? 'Pick a model above.'}{' '}
                  Applies to every practice. Costs are rough estimates for an hour of continuous dictation.
                </p>
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
                        {th(aiSort, 'user', 'User')}
                        {th(aiSort, 'calls', 'Calls')}
                        {th(aiSort, 'input', 'Input')}
                        {th(aiSort, 'output', 'Output')}
                        {th(aiSort, 'cache', 'Cache')}
                        {th(aiSort, 'cost', 'Est. cost')}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAi.map((u) => (
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
      {viewingChart && (
        <AdminChartViewer
          data={viewingChart.data}
          practiceName={viewingChart.practiceName}
          onClose={() => setViewingChart(null)}
        />
      )}
    </div>
  );
};
