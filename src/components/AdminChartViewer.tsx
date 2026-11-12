import React from 'react';
import ReactDOM from 'react-dom';
import { ToothDiagram } from './ToothDiagram';
import { useModalFocus } from '../hooks/useModalFocus';
import { isChartSnapshot, normalizeSnapshot } from '../hooks/useChartState';
import {
  ChartSnapshot,
  EXAM_ITEMS,
  NerveBlockSite,
  ToothData,
  ToothMarks,
  formatAnestheticDrug,
} from '../types';

/**
 * Admin-only, read-only view of any practice's chart (from Admin →
 * Practices → Charts). Rendered purely from the snapshot admin-api's
 * view_chart returns (which logs the view) — it never touches the admin's
 * own working chart, cloud sync or storage, so nothing can be saved into
 * either practice from here.
 */

const BLOCK_LABELS: Record<NerveBlockSite, string> = {
  infraorbitalRight: 'Infraorbital R',
  infraorbitalLeft: 'Infraorbital L',
  caudalMaxillaryRight: 'Caudal maxillary R',
  caudalMaxillaryLeft: 'Caudal maxillary L',
  inferiorAlveolarRight: 'Inferior alveolar R',
  inferiorAlveolarLeft: 'Inferior alveolar L',
  mentalRight: 'Mental R',
  mentalLeft: 'Mental L',
  other: 'Other',
};

const PERIO_FIELDS: { key: keyof ToothData; label: string }[] = [
  { key: 'gingivitis', label: 'GI' },
  { key: 'calculus', label: 'Calc' },
  { key: 'pdstate', label: 'PD' },
  { key: 'mobility', label: 'Mob' },
  { key: 'pocket', label: 'Pocket' },
  { key: 'recession', label: 'Rec' },
  { key: 'furcation', label: 'Furc' },
  { key: 'hyperplasia', label: 'Hyper' },
];

const noop = () => {};

export interface AdminChartViewerProps {
  /** Raw `data` of the chart row (validated here). */
  data: unknown;
  practiceName: string;
  onClose: () => void;
}

/** Teeth with any perio value, in Triadan order. */
export function chartedTeeth(toothData: ToothData[]): ToothData[] {
  return toothData
    .filter((t) => PERIO_FIELDS.some((f) => String(t[f.key] ?? '').trim()))
    .sort((a, b) => a.triadan - b.triadan);
}

export const AdminChartViewer: React.FC<AdminChartViewerProps> = ({ data, practiceName, onClose }) => {
  const modalRef = useModalFocus<HTMLDivElement>(true);
  // Escape closes just this view, not the admin panel underneath.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const snap: ChartSnapshot | null = React.useMemo(
    () => (isChartSnapshot(data) ? normalizeSnapshot(data) : null),
    [data],
  );

  const body = !snap ? (
    <p className="login-error" role="alert">This chart's data is damaged and can't be shown.</p>
  ) : (
    <ChartBody snap={snap} />
  );
  const p = snap?.patientInfo;

  return ReactDOM.createPortal(
    <div className="ai-settings-overlay admin-chart-viewer__overlay" role="dialog" aria-modal="true" aria-label="Admin chart view">
      <div className="ai-settings-modal admin-chart-viewer" ref={modalRef} tabIndex={-1}>
        <header className="ai-settings-header">
          <h2>
            {practiceName} · {p?.patientName || 'Unnamed patient'}
            {p?.patientNumber ? ` #${p.patientNumber}` : ''}
            {p?.date ? ` · ${p.date}` : ''}
          </h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="admin-chart-viewer__notice">Read-only admin view. This view is logged.</div>
        <div className="admin-chart-viewer__body">{body}</div>
      </div>
    </div>,
    document.body,
  );
};

function Row({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null;
  return (
    <div className="admin-chart-viewer__row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ChartBody({ snap }: { snap: ChartSnapshot }) {
  const p = snap.patientInfo;
  const exam = EXAM_ITEMS.filter((i) => p.exam[i.key]?.status);
  const blocks = (Object.keys(BLOCK_LABELS) as NerveBlockSite[]).filter((k) => p.nerveBlocks[k]?.trim());
  const drugs = (p.nerveBlocks.drugs ?? []).filter((d) => d.name.trim());
  const teeth = chartedTeeth(snap.toothData);
  const effectivePost: ToothMarks = { ...snap.postMarks };
  for (const [k, m] of Object.entries(snap.preMarks)) if (m === 'missing') effectivePost[Number(k)] = 'missing';
  const planned = (snap.plannedExtractions ?? []).slice().sort((a, b) => a - b);

  return (
    <>
      <section>
        <h3 className="ai-settings-subhead">Patient</h3>
        <dl className="admin-chart-viewer__list">
          <Row label="Species" value={snap.species} />
          <Row label="Visit date" value={p.date} />
          <Row label="Doctor" value={p.doctor} />
          <Row label="Tech" value={p.tech} />
          <Row label="Owner" value={[p.ownerName, p.ownerPhone, p.ownerEmail].filter(Boolean).join(' · ')} />
          <Row label="Complaint" value={p.complaint} />
          <Row label="Recheck" value={p.recallDate} />
        </dl>
      </section>

      <section>
        <h3 className="ai-settings-subhead">Exam</h3>
        {exam.length === 0 ? <p className="admin-chart-viewer__empty">Not recorded</p> : (
          <dl className="admin-chart-viewer__list">
            {exam.map((i) => (
              <Row key={i.key} label={i.label} value={`${p.exam[i.key].status}${p.exam[i.key].comment ? ` — ${p.exam[i.key].comment}` : ''}`} />
            ))}
          </dl>
        )}
      </section>

      <section>
        <h3 className="ai-settings-subhead">Anesthesia</h3>
        {blocks.length === 0 && drugs.length === 0 ? <p className="admin-chart-viewer__empty">Not recorded</p> : (
          <dl className="admin-chart-viewer__list">
            <Row label="Drugs" value={drugs.map(formatAnestheticDrug).join(' + ')} />
            {blocks.map((k) => <Row key={k} label={BLOCK_LABELS[k]} value={k === 'other' ? p.nerveBlocks[k] : `${p.nerveBlocks[k]} mL`} />)}
          </dl>
        )}
      </section>

      <section>
        <h3 className="ai-settings-subhead">Diagnosis</h3>
        <div className="admin-chart-viewer__diagram">
          <ToothDiagram
            species={snap.species}
            toothMarks={snap.preMarks}
            onToothMarksChange={noop}
            comments={snap.preComments}
            onCommentsChange={noop}
            strokes={snap.preStrokes}
            onStrokesChange={noop}
            tool="mark"
            strokeColor="#000"
            strokeWidth={2}
            readOnly
            showNumbers
          />
        </div>
      </section>

      <section>
        <h3 className="ai-settings-subhead">Procedure</h3>
        <div className="admin-chart-viewer__diagram">
          <ToothDiagram
            species={snap.species}
            toothMarks={effectivePost}
            onToothMarksChange={noop}
            comments={snap.postComments}
            onCommentsChange={noop}
            strokes={snap.postStrokes}
            onStrokesChange={noop}
            tool="mark"
            strokeColor="#000"
            strokeWidth={2}
            readOnly
            showNumbers
          />
        </div>
        {planned.length > 0 && <p className="admin-chart-viewer__empty">Planned extractions: {planned.join(', ')}</p>}
      </section>

      <section>
        <h3 className="ai-settings-subhead">Periodontal charting</h3>
        {teeth.length === 0 ? <p className="admin-chart-viewer__empty">No values recorded</p> : (
          <div className="admin-chart-viewer__table-wrap">
            <table className="admin-panel__usage-table">
              <thead>
                <tr><th>Tooth</th>{PERIO_FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}</tr>
              </thead>
              <tbody>
                {teeth.map((t) => (
                  <tr key={t.triadan}>
                    <td>{t.triadan}</td>
                    {PERIO_FIELDS.map((f) => <td key={f.key}>{String(t[f.key] ?? '')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {p.radiographicFindings?.trim() && (
        <section>
          <h3 className="ai-settings-subhead">Radiographic findings</h3>
          <p className="admin-chart-viewer__report">{p.radiographicFindings}</p>
        </section>
      )}

      <section>
        <h3 className="ai-settings-subhead">Treatment report</h3>
        {p.treatmentReport.trim()
          ? <p className="admin-chart-viewer__report">{p.treatmentReport}</p>
          : <p className="admin-chart-viewer__empty">Empty</p>}
      </section>
    </>
  );
}
