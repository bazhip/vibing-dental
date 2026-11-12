import React from 'react';
import ReactDOM from 'react-dom';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { useChartHistory, ChartRevision } from '../hooks/useChartHistory';
import { ChartReadOnlyView } from './AdminChartViewer';
import { confirmDialog, toast } from './ui/dialogs';
import { isChartSnapshot, normalizeSnapshot } from '../hooks/useChartState';
import type { ChartSnapshot } from '../types';

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
  new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** "Nov 12, 2026, 3:02 PM" or "Nov 12, 2026, 3:02 PM – 3:40 PM". */
export function revisionWhen(r: Pick<ChartRevision, 'startedAt' | 'savedAt'>): string {
  const a = new Date(r.startedAt);
  const b = new Date(r.savedAt);
  if (b.getTime() - a.getTime() < 60_000) return fmt(r.savedAt);
  return a.toDateString() === b.toDateString() ? `${fmt(r.startedAt)} – ${fmtTime(r.savedAt)}` : `${fmt(r.startedAt)} – ${fmt(r.savedAt)}`;
}

export const ChartHistoryModal: React.FC<ChartHistoryModalProps> = ({ chartId, onClose, onRestore, label, restoreHint, onOpenChart }) => {
  const modalRef = useModalFocus<HTMLDivElement>(true);
  const backdrop = useBackdropDismiss(onClose);
  const { revisions, error, loadData } = useChartHistory(chartId, true);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [data, setData] = React.useState<unknown>(null);
  const [loading, setLoading] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const pick = async (id: number) => {
    setSelected(id);
    setData(null);
    setLoading(true);
    try {
      setData(await loadData(id));
    } catch (err) {
      toast(`Couldn’t load that version. ${err instanceof Error ? err.message : ''}`.trim(), { kind: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const current = revisions?.[0]?.id;
  const chosen = revisions?.find((r) => r.id === selected);

  const restore = async () => {
    if (!onRestore || !chosen || !isChartSnapshot(data)) return;
    if (!(await confirmDialog({
      title: 'Restore this version?',
      message: `The chart goes back to how it was saved ${revisionWhen(chosen)}. Today’s version stays in the history, so you can switch back.`,
      confirmLabel: 'Restore',
    }))) return;
    setRestoring(true);
    try {
      if (await onRestore(normalizeSnapshot(data))) {
        toast('Version restored.', { kind: 'success' });
        onClose();
      }
    } catch (err) {
      toast(`Couldn’t restore. ${err instanceof Error ? err.message : ''}`.trim(), { kind: 'error' });
    } finally {
      setRestoring(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="ai-settings-overlay" {...backdrop} role="dialog" aria-modal="true" aria-label="Chart history">
      <div className="ai-settings-modal chart-history" ref={modalRef} tabIndex={-1}>
        <header className="ai-settings-header">
          <h2>{label ? `History — ${label}` : 'Chart history'}</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        {onOpenChart && (
          <div className="chart-history__bar">
            <button type="button" className="diagram-view__action" onClick={onOpenChart}>Open this visit</button>
          </div>
        )}
        <div className="chart-history__body">
          <div className="chart-history__list">
            {revisions === null ? (
              <p className="chart-history__empty">Loading…</p>
            ) : error ? (
              <p className="login-error" role="alert">{error}</p>
            ) : revisions.length === 0 ? (
              <p className="chart-history__empty">No saved versions yet — history starts with the first save.</p>
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
                        {r.savedByName || (r.savedBy ? 'Someone outside your practice' : 'ToothOps (automatic)')}
                        {r.id === current && <span className="chart-history__tag">Current</span>}
                      </span>
                      <span className="chart-history__when">
                        {r.note === 'baseline' ? `Before history began · last saved ${fmt(r.savedAt)}` : revisionWhen(r)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="chart-history__preview">
            {selected == null ? (
              <p className="chart-history__empty">Pick a version to see it.</p>
            ) : loading ? (
              <p className="chart-history__empty">Loading this version…</p>
            ) : data ? (
              <>
                <div className="chart-history__preview-head">
                  <span>{chosen ? revisionWhen(chosen) : ''}</span>
                  {selected !== current && (
                    onRestore ? (
                      <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={restore} disabled={restoring}>
                        {restoring ? 'Restoring…' : 'Restore this version'}
                      </button>
                    ) : (
                      <span className="chart-history__hint">{restoreHint ?? 'Choose Edit chart to restore an earlier version.'}</span>
                    )
                  )}
                </div>
                <div className="chart-history__view"><ChartReadOnlyView data={data} /></div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
