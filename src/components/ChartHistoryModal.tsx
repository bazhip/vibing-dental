import React from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { formatDateTime, formatTime } from '../i18n/format';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { useChartHistory, ChartRevision } from '../hooks/useChartHistory';
import { ChartReadOnlyView } from './AdminChartViewer';
import { confirmDialog, toast } from './ui/dialogs';
import { detailText } from '../utils/apiErrors';
import { isChartSnapshot, normalizeSnapshot } from '../hooks/useChartState';
import type { ChartSnapshot } from '../types';
import { isNativeApp } from '../native/platform';
import { Sheet } from '../ios/Sheet';

/**
 * Chart history: every saved version of this chart — who saved it and
 * when — with a read-only preview and "Restore this version". Restoring
 * saves the old version as a new revision by you; nothing is ever
 * removed from the history.
 */

export interface ChartHistoryModalProps {
  chartId: string;
  onClose: () => void;
  /** Restore (save) a version; resolves false when cancelled. Absent =
   *  view-only (the chart can't be edited right now). */
  onRestore?: (snapshot: ChartSnapshot) => Promise<boolean>;
  /** Which chart, e.g. "Bella · Nov 12, 2026". */
  label?: string;
  /** Shown instead of Restore when restoring isn't possible here. */
  restoreHint?: string;
  /** From My charts: open this visit (where it can be restored). */
  onOpenChart?: () => void;
}

const fmt = (iso: string) =>
  formatDateTime(iso, i18n.language, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtTime = (iso: string) => formatTime(iso);

/** "Nov 12, 2026, 3:02 PM" or "Nov 12, 2026, 3:02 PM – 3:40 PM". */
export function revisionWhen(r: Pick<ChartRevision, 'startedAt' | 'savedAt'>): string {
  const a = new Date(r.startedAt);
  const b = new Date(r.savedAt);
  if (b.getTime() - a.getTime() < 60_000) return fmt(r.savedAt);
  const range = (end: string) => i18n.t('history.range', { ns: 'library', start: fmt(r.startedAt), end });
  return range(a.toDateString() === b.toDateString() ? fmtTime(r.savedAt) : fmt(r.savedAt));
}

export const ChartHistoryModal: React.FC<ChartHistoryModalProps> = ({ chartId, onClose, onRestore, label, restoreHint, onOpenChart }) => {
  const { t } = useTranslation('library');
  // iOS app: a kit sheet, which handles focus, Escape and dismissal itself.
  const native = isNativeApp();
  const modalRef = useModalFocus<HTMLDivElement>(!native);
  const backdrop = useBackdropDismiss(onClose);
  const { revisions, error, loadData } = useChartHistory(chartId, true);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [data, setData] = React.useState<unknown>(null);
  const [loading, setLoading] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);

  React.useEffect(() => {
    if (native) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose, native]);

  const pick = async (id: number) => {
    setSelected(id);
    setData(null);
    setLoading(true);
    try {
      setData(await loadData(id));
    } catch (err) {
      toast(t('history.loadFailed', { error: detailText(err) }).trim(), { kind: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const current = revisions?.[0]?.id;
  const chosen = revisions?.find((r) => r.id === selected);

  const restore = async () => {
    if (!onRestore || !chosen || !isChartSnapshot(data)) return;
    if (!(await confirmDialog({
      title: t('history.confirmTitle'),
      message: t('history.confirmMessage', { when: revisionWhen(chosen) }),
      confirmLabel: t('history.confirmButton'),
    }))) return;
    setRestoring(true);
    try {
      if (await onRestore(normalizeSnapshot(data))) {
        toast(t('history.restored'), { kind: 'success' });
        onClose();
      }
    } catch (err) {
      toast(t('history.restoreFailed', { error: detailText(err) }).trim(), { kind: 'error' });
    } finally {
      setRestoring(false);
    }
  };

  const content = (
    <>
      {onOpenChart && (
        <div className="chart-history__bar">
          <button type="button" className="diagram-view__action" onClick={onOpenChart}>{t('history.openVisit')}</button>
        </div>
      )}
      <div className="chart-history__body">
        <div className="chart-history__list">
          {revisions === null ? (
            <p className="chart-history__empty">{t('history.loading')}</p>
          ) : error ? (
            <p className="login-error" role="alert">{error}</p>
          ) : revisions.length === 0 ? (
            <p className="chart-history__empty">{t('history.empty')}</p>
          ) : (
            <ul>
              {revisions.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`chart-history__row${r.id === selected ? ' chart-history__row--on' : ''}`}
                    onClick={() => pick(r.id)}
                    aria-pressed={r.id === selected}
                  >
                    <span className="chart-history__who">
                      {r.savedByName || (r.savedBy ? t('history.outside') : t('history.automatic'))}
                      {r.id === current && <span className="chart-history__tag">{t('history.current')}</span>}
                    </span>
                    <span className="chart-history__when">
                      {r.note === 'baseline' ? t('history.baseline', { when: fmt(r.savedAt) }) : revisionWhen(r)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="chart-history__preview">
          {selected == null ? (
            <p className="chart-history__empty">{t('history.pick')}</p>
          ) : loading ? (
            <p className="chart-history__empty">{t('history.loadingVersion')}</p>
          ) : data ? (
            <>
              <div className="chart-history__preview-head">
                <span>{chosen ? revisionWhen(chosen) : ''}</span>
                {selected !== current && (
                  onRestore ? (
                    <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={restore} disabled={restoring}>
                      {restoring ? t('history.restoring') : t('history.restore')}
                    </button>
                  ) : (
                    <span className="chart-history__hint">{restoreHint ?? t('history.restoreHint')}</span>
                  )
                )}
              </div>
              <div className="chart-history__view"><ChartReadOnlyView data={data} /></div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );

  if (native) {
    return (
      <Sheet open onClose={onClose} title={t('history.title')} className="ios-sheet--page chart-history-sheet">
        {label && <p className="chart-history-sheet__label">{label}</p>}
        {content}
      </Sheet>
    );
  }

  return ReactDOM.createPortal(
    <div className="ai-settings-overlay" {...backdrop} role="dialog" aria-modal="true" aria-label={t('history.aria')}>
      <div className="ai-settings-modal chart-history" ref={modalRef} tabIndex={-1}>
        <header className="ai-settings-header">
          <h2>{label ? t('history.titleWith', { label }) : t('history.title')}</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label={t('actions.close', { ns: 'common' })}>×</button>
        </header>
        {content}
      </div>
    </div>,
    document.body,
  );
};
