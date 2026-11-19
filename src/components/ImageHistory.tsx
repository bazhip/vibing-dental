import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../i18n/format';
import { listAttachmentsForCharts, type Attachment } from '../hooks/useAttachments';
import { ImageViewer } from './ImageViewer';

/** One of the patient's other visits. `date` is the chart date (YYYY-MM-DD, may be ''). */
export interface ImageHistoryVisit {
  id: string;
  date: string;
}

export interface ImageHistoryProps {
  /** The patient's visits other than the open one, any order. */
  visits: ImageHistoryVisit[];
  /** Open one of those visits (switches the chart). */
  onOpenVisit?: (chartId: string) => void;
  /** Tooth name for pinned images. */
  toothLabel?: (triadan: number) => string;
}

type Group = { visit: ImageHistoryVisit; items: Attachment[] };

/** Visits that have images, newest visit first; images oldest first within a visit. */
export function groupByVisit(visits: ImageHistoryVisit[], items: Attachment[]): Group[] {
  const byChart = new Map<string, Attachment[]>();
  for (const a of items) byChart.set(a.chartId, [...(byChart.get(a.chartId) ?? []), a]);
  return visits
    .filter((v) => byChart.has(v.id))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map((visit) => ({ visit, items: [...byChart.get(visit.id)!].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }));
}

const visitDate = (iso: string) => formatDate(iso, 'medium');

/** Read-only thumbnails from other visits, loaded automatically and grouped by date. */
export const ImageHistory: React.FC<ImageHistoryProps> = ({ visits, onOpenVisit, toothLabel }) => {
  const { t } = useTranslation('media');
  const [result, setResult] = React.useState<{ key: string; items: Attachment[] | null; failed: boolean } | null>(null);
  const [viewing, setViewing] = React.useState<number | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [expandedVisitKey, setExpandedVisitKey] = React.useState<string | null>(null);
  const bodyId = React.useId();
  const visitKey = JSON.stringify(visits.map(({ id, date }) => ({ id, date })).sort((a, b) => a.id.localeCompare(b.id)));
  // Key the rendered result as well as cancelling the request: a new patient
  // must never show the previous patient's thumbnails, even before effects run.
  const items = result?.key === visitKey ? result.items : null;
  const failed = result?.key === visitKey && result.failed;

  React.useEffect(() => {
    let cancelled = false;
    setViewing(null);
    setResult({ key: visitKey, items: null, failed: false });
    if (visits.length === 0) return;
    listAttachmentsForCharts(visits.map((v) => v.id))
      .then((rows) => {
        if (!cancelled) setResult({ key: visitKey, items: rows, failed: rows === null });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: visitKey, items: null, failed: true });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visitKey includes every visit id and date
  }, [visitKey, attempt]);

  const groups = React.useMemo(() => (items ? groupByVisit(visits, items) : []), [items, visits]);
  const flat = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const dateOf = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) for (const a of g.items) m.set(a.id, g.visit.date);
    return m;
  }, [groups]);

  if (visits.length === 0 || (!failed && groups.length === 0)) return null;
  const expanded = expandedVisitKey === visitKey;

  return (
    <section className="image-history" aria-labelledby={`${bodyId}-title`}>
      <header className="image-history__header">
        <h2 id={`${bodyId}-title`} className="patient-form__section-title">{t('history.title')}</h2>
        {flat.length > 1 && (
          <button type="button" className="diagram-view__action" aria-expanded={expanded} aria-controls={bodyId}
            onClick={() => setExpandedVisitKey(expanded ? null : visitKey)}>
            {t(expanded ? 'history.collapse' : 'history.expand')}
          </button>
        )}
      </header>
      <div id={bodyId} className={flat.length > 0 && !expanded ? 'image-history__body image-history__body--strip' : 'image-history__body'}
        tabIndex={!expanded && flat.length > 1 ? 0 : undefined}>
          {failed ? (
            <p className="login-error" role="alert">
              {t('history.failed')}{' '}
              <button type="button" className="image-history__retry" onClick={() => setAttempt((n) => n + 1)}>
                {t('history.retry')}
              </button>
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.visit.id} className="image-history__visit">
                <div className="image-history__visit-head">
                  <h3 className="image-history__date">
                    {g.visit.date ? visitDate(g.visit.date) : t('history.undated')}
                  </h3>
                  <span className="patient-form__hint">{t('history.imageCount', { count: g.items.length })}</span>
                  {onOpenVisit && (
                    <button type="button" className="diagram-view__action image-history__open" onClick={() => onOpenVisit(g.visit.id)}>
                      {t('history.openVisit')}
                    </button>
                  )}
                </div>
                <ul className="image-history__grid">
                  {g.items.map((a) => {
                    const kindLabel = a.kind === 'xray' ? t('imaging.radiograph') : t('imaging.photo');
                    return (
                      <li key={a.id} className="image-history__item">
                        <button
                          type="button"
                          className="image-history__thumb-btn"
                          onClick={() => setViewing(flat.indexOf(a))}
                          title={t('imaging.openViewer')}
                        >
                          {a.toothTriadan !== null && <span className="imaging__tooth-badge">{a.toothTriadan}</span>}
                          {a.url ? (
                            <img src={a.thumbUrl || a.url} alt={a.caption || kindLabel} className="imaging__thumb" loading="lazy" />
                          ) : (
                            <span className="imaging__thumb imaging__thumb--missing">{t('imaging.missing')}</span>
                          )}
                        </button>
                        <span className="image-history__label">
                          {kindLabel}
                          {a.caption && ` — ${a.caption}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
      </div>

      {viewing !== null && flat[viewing] && (
        <ImageViewer
          items={flat}
          index={viewing}
          onIndexChange={setViewing}
          onClose={() => setViewing(null)}
          toothLabel={toothLabel}
          dateLabel={(a) => {
            const d = dateOf.get(a.id);
            return d ? visitDate(d) : undefined;
          }}
        />
      )}
    </section>
  );
};
