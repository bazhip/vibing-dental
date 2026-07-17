import React from 'react';
import { supabase } from '../utils/supabaseClient';

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

/** Call the admin-api function; surfaces server-side error messages. */
async function adminCall<T = Record<string, unknown>>(body: object): Promise<T> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { data, error } = await supabase.functions.invoke('admin-api', { body });
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

  const selected = users?.find((u) => u.id === selectedId) ?? null;

  const refresh = React.useCallback(async () => {
    setError('');
    try {
      const [s, u] = await Promise.all([
        adminCall<AdminStats>({ action: 'stats' }),
        adminCall<{ users: AdminUser[] }>({ action: 'list_users' }),
      ]);
      setStats(s);
      setUsers(u.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load accounts.');
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      setSelectedId(null);
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

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  return (
    <div className="ai-settings-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Admin panel">
      <div className="ai-settings-modal chart-library-modal admin-panel" onClick={(e) => e.stopPropagation()}>
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

          {error && <div className="login-error" role="alert">{error}</div>}
          {notice && <div className="login-notice" role="status">{notice}</div>}

          {users !== null && users.length > 0 && (
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

          {selected && (
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
        </div>
      </div>
    </div>
  );
};
