import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../utils/supabaseClient';
import { SignIn } from './SignIn';
import { usePanelLanguage } from './panelLanguage';
import { ChartList } from './ChartList';
import { ChartSend } from './ChartSend';
import { useConsultInspect } from './useConsultInspect';
import { DialogHost } from '../../components/ui/dialogs';
import type { CloudChartMeta } from '../../utils/chartQueries';

/** The side panel: sign-in, or the signed-in shell. Its session is its own (extension-page
 *  storage), separate from the ToothOps web app's. */
export function SidePanelApp(): React.ReactElement {
  const { t } = useTranslation(['pims', 'auth']);
  // undefined = not known yet; null = signed out.
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [picked, setPicked] = useState<CloudChartMeta | null>(null);
  usePanelLanguage(session?.user.id ?? null);
  // Only asked in the list: once signed in, and not while a chart is open (ChartSend inspects itself).
  const inspect = useConsultInspect(!!session && !picked);

  useEffect(() => {
    if (!supabase) return;
    // Every change arrives here, starting with INITIAL_SESSION. A refresh that fails (expired
    // session, signed out elsewhere) ends as SIGNED_OUT with no session: back to sign-in.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) return <p className="sp-notice">{t('pims:panel.notConnected')}</p>;
  if (session === undefined) return <p className="sp-notice">{t('auth:loading')}</p>;
  if (!session) return <SignIn />;
  return (
    <div className="sp-shell">
      <header className="sp-header">
        <span className="sp-header__email">{t('pims:panel.header.signedInAs', { email: session.user.email ?? '' })}</span>
        <button type="button" className="sp-link" onClick={() => void supabase!.auth.signOut({ scope: 'local' })}>
          {t('pims:panel.header.signOut')}
        </button>
      </header>
      <main className="sp-main">
        {picked ? <ChartSend chart={picked} onBack={() => setPicked(null)} /> : <ChartList inspect={inspect} onPick={setPicked} />}
      </main>
      <DialogHost />
    </div>
  );
}
