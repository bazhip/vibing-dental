import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../utils/supabaseClient';
import { SignIn } from './SignIn';
import { usePanelLanguage } from './panelLanguage';
import { ChartList } from './ChartList';
import { ChartSend } from './ChartSend';
import { useConsultInspect } from './useConsultInspect';
import { usePimsSendFlag } from './usePimsSendFlag';
import { DialogHost } from '../../components/ui/dialogs';
import type { CloudChartMeta } from '../../utils/chartQueries';

/** sessionStorage key of the panel's sent dates: `${userId}:${chartId}` → ISO date. */
export const SENT_DATES_KEY = 'toothops.panel.sentDates';

function readSentDates(): Record<string, string> {
  try {
    const raw = window.sessionStorage.getItem(SENT_DATES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeSentDates(dates: Record<string, string>): void {
  try {
    if (Object.keys(dates).length) window.sessionStorage.setItem(SENT_DATES_KEY, JSON.stringify(dates));
    else window.sessionStorage.removeItem(SENT_DATES_KEY);
  } catch { /* storage unavailable: the memory still lasts while the panel is open */ }
}

/** The side panel: sign-in, or the signed-in shell. Its session is its own (extension-page
 *  storage), separate from the ToothOps web app's. */
export function SidePanelApp(): React.ReactElement {
  const { t } = useTranslation(['pims', 'auth']);
  // undefined = not known yet; null = signed out.
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // Tagged with the account that picked it, so another account never sees it, even for one render.
  const [pickedBy, setPicked] = useState<{ userId: string; chart: CloudChartMeta } | null>(null);
  const [busy, setBusy] = useState(false);
  // When this panel session sent (or may have sent) a chart. A send can leave pims_sent_at empty
  // (maybe sent, stamp failed), so this is what makes a re-picked chart still ask first. Kept in
  // sessionStorage so a panel reload keeps it; cleared on sign-out or another account.
  const [sentDates, setSentDates] = useState<Record<string, string>>(readSentDates);
  const userId = session?.user.id ?? null;
  const picked = pickedBy && pickedBy.userId === userId ? pickedBy.chart : null;
  const lastUser = useRef<string | null | undefined>(undefined);
  usePanelLanguage(userId);
  const { flag: sendFlag, retry: retrySendFlag } = usePimsSendFlag(userId);
  // Only asked in the list: once signed in, and not while a chart is open (ChartSend inspects itself).
  const inspect = useConsultInspect(!!session && !picked);

  useEffect(() => {
    if (!supabase) return;
    // Every change arrives here, starting with INITIAL_SESSION. A refresh that fails (expired
    // session, signed out elsewhere) ends as SIGNED_OUT with no session: back to sign-in.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  // Signed out, or another account: nothing of the previous one stays (shared practice PCs).
  useEffect(() => {
    if (session === undefined) return;
    const previous = lastUser.current;
    lastUser.current = userId;
    if (userId === null || (previous != null && previous !== userId)) {
      setPicked(null);
      setBusy(false);
      setSentDates({});
      writeSentDates({});
    }
  }, [session, userId]);

  const rememberSent = useCallback((chartId: string, at: string) => {
    if (!userId) return;
    setSentDates((prev) => {
      const next = { ...prev, [`${userId}:${chartId}`]: at };
      writeSentDates(next);
      return next;
    });
  }, [userId]);

  if (!supabase) return <p className="sp-notice">{t('pims:panel.notConnected')}</p>;
  if (session === undefined) return <p className="sp-notice">{t('auth:loading')}</p>;
  if (!session) return <SignIn />;
  return (
    <div className="sp-shell">
      <header className="sp-header">
        <span className="sp-header__email">{t('pims:panel.header.signedInAs', { email: session.user.email ?? '' })}</span>
        {/* Not during a send: it would leave a write running for an account that is gone. */}
        <button type="button" className="sp-link" disabled={busy} onClick={() => void supabase!.auth.signOut({ scope: 'local' })}>
          {t('pims:panel.header.signOut')}
        </button>
      </header>
      <main className="sp-main">
        {picked ? (
          <ChartSend
            key={picked.id}
            chart={picked}
            onBack={() => setPicked(null)}
            sendFlag={sendFlag}
            onRetrySendFlag={retrySendFlag}
            knownSentAt={sentDates[`${session.user.id}:${picked.id}`] ?? null}
            onSent={(at) => rememberSent(picked.id, at)}
            onBusyChange={setBusy}
          />
        ) : (
          <ChartList inspect={inspect} onPick={(chart) => setPicked({ userId: session.user.id, chart })} />
        )}
      </main>
      <DialogHost />
    </div>
  );
}
