import React from 'react';
import { useTranslation } from 'react-i18next';
import { ensureAiConsent } from '../native/aiConsent';
import { supabase } from '../utils/supabaseClient';
import { refineClinicalText, REFINEMENT_LIMIT, REFINEMENT_MODES, type RefinementMode } from '../utils/refineClinicalText';
import { confirmDialog, friendlyError } from './ui/dialogs';
import type { ReportLocale } from '../utils/ownerReportI18n';
import './RefineTextAction.css';

export const RefineTextContext = React.createContext({ enabled: false, scope: '' });

interface Props {
  value: string;
  onApply: (text: string) => void;
  readOnly?: boolean;
  enabled?: boolean;
  disabled?: boolean;
  maxLength?: number;
  singleLine?: boolean;
  language?: ReportLocale;
  scopeKey?: string;
}

export function RefineTextAction({ value, onApply, readOnly, enabled, disabled, maxLength, singleLine, language, scopeKey }: Props) {
  const { t } = useTranslation('app');
  const context = React.useContext(RefineTextContext);
  const available = (enabled ?? context.enabled) && !readOnly;
  const canRefine = available && !disabled && !!value.trim() && value.length <= REFINEMENT_LIMIT;
  const scope = JSON.stringify([context.scope, scopeKey]);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ scope: string; value: string; text: string; error?: boolean }>();
  const feedback = notice?.scope === scope && notice.value === value ? notice : undefined;
  const details = React.useRef<HTMLDetailsElement>(null);
  const request = React.useRef({ mounted: false, serial: 0, busy: false });
  const current = React.useRef({ value, scope, canRefine, language, onApply });
  if (current.current.value !== value || current.current.scope !== scope || current.current.canRefine !== canRefine || current.current.language !== language) {
    request.current.serial++;
  }
  current.current = { value, scope, canRefine, language, onApply };

  React.useEffect(() => {
    request.current.mounted = true;
    return () => { request.current.mounted = false; request.current.serial++; };
  }, []);

  if (!available) return null;
  if (!canRefine) return <button type="button" className="diagram-view__action refine-text__disabled" aria-label={t('refinement.action')} disabled
    title={disabled ? undefined : t(value.trim() ? 'refinement.tooLong' : 'refinement.enterText')}>
    <span aria-hidden="true">✨</span> <span className="refine-text__label">{t('refinement.action')}</span>
  </button>;

  const refine = async (mode: RefinementMode) => {
    const state = request.current;
    if (state.busy) return;
    const source = value;
    const serial = ++state.serial;
    const active = () => state.mounted && state.serial === serial && current.current.canRefine;
    const disclosure = details.current;
    if (disclosure) {
      disclosure.open = false;
      disclosure.querySelector('summary')?.focus();
    }
    const announce = (text: string, value = source, error = false) => setNotice({ scope, value, text, error });
    state.busy = true;
    setNotice(undefined);
    setBusy(true);
    const subscription = supabase?.auth?.onAuthStateChange?.(event => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') state.serial++;
    });
    try {
      const consent = await ensureAiConsent();
      if (!active()) return;
      if (!consent) {
        announce(t('refinement.consentRequired'));
        return;
      }
      const result = await refineClinicalText(source, mode, maxLength, language);
      if (!active()) {
        if (state.mounted && current.current.scope === scope && current.current.canRefine && current.current.value !== source) {
          announce(t('refinement.fieldChanged'), current.current.value);
        }
        return;
      }
      const draft = singleLine ? result.replace(/\s*\r?\n\s*/g, ' ') : result;
      if (draft === source.trim()) {
        announce(t('refinement.noChanges'));
        return;
      }
      const accepted = await confirmDialog({
        title: t('refinement.review'),
        message: <div className="refine-text__comparison">
          <div><strong>{t('refinement.original')}</strong><p>{source}</p></div>
          <div><strong>{t('refinement.proposed')}</strong><p>{draft}</p></div>
        </div>,
        confirmLabel: t('refinement.apply'),
      });
      if (!active()) return;
      if (accepted) {
        current.current.onApply(draft);
        announce(t('refinement.applied'), draft);
      } else {
        announce(t('refinement.kept'));
      }
    } catch (error) {
      if (active()) announce(friendlyError(error, t('refinement.failed')), source, true);
    } finally {
      subscription?.data.subscription.unsubscribe();
      state.busy = false;
      if (state.mounted) setBusy(false);
    }
  };

  return <div className="refine-text__control">
  <details className="refine-text" ref={details}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }}
    onKeyDown={event => {
      if (event.key !== 'Escape' || !event.currentTarget.open) return;
      event.stopPropagation();
      event.currentTarget.open = false;
      event.currentTarget.querySelector('summary')?.focus();
    }}>
    <summary className="diagram-view__action" aria-label={t('refinement.action')} title={t('refinement.action')} aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }}>
      <span aria-hidden="true">✨</span> <span className="refine-text__label">{t('refinement.action')}</span>
    </summary>
    <div className="refine-text__options">
      {REFINEMENT_MODES.map(mode => <button type="button" key={mode} onClick={() => void refine(mode)}>
        {t(`refinement.modes.${mode}`)}
      </button>)}
    </div>
  </details>
  {busy ? <p className="refine-text__feedback" role="status">{t('radiologyReport.refining')}</p>
    : feedback && <p className={feedback.error ? 'refine-text__feedback refine-text__feedback--error' : 'refine-text__feedback'}
        role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
  </div>;
}
