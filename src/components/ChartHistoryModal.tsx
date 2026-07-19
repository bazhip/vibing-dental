import React from 'react';
import { ChartAuditEntry } from '../types';
import { useModalFocus } from '../hooks/useModalFocus';

interface ChartHistoryModalProps {
  open: boolean;
  onClose: () => void;
  entries: ChartAuditEntry[];
}

const ACTION_LABELS: Record<ChartAuditEntry['action'], string> = {
  created: 'Created',
  saved: 'Saved',
  'imported-pdf': 'Imported from a chart PDF',
};

/**
 * Save history for the open chart — every cloud write, newest first.
 * Practice-internal accountability ("who changed this chart, when"),
 * not a forensic log: the history travels inside the chart row itself.
 */
export const ChartHistoryModal: React.FC<ChartHistoryModalProps> = ({
  open,
  onClose,
  entries,
}) => {
  const modalRef = useModalFocus(open);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const newestFirst = [...entries].reverse();

  return (
    <div className="ai-settings-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Chart history">
      <div className="ai-settings-modal chart-history-modal" ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className="ai-settings-header">
          <h2>Chart history</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="ai-settings-body">
          {newestFirst.length === 0 ? (
            <p className="ai-settings-blurb">
              No saves recorded yet — history starts with this chart's first
              cloud save.
            </p>
          ) : (
            <ul className="chart-history__list">
              {newestFirst.map((entry, i) => (
                <li key={`${entry.at}-${i}`} className="chart-history__entry">
                  <span className="chart-history__action">{ACTION_LABELS[entry.action]}</span>
                  <span className="chart-history__meta">
                    {new Date(entry.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    {entry.by ? ` · ${entry.by}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
