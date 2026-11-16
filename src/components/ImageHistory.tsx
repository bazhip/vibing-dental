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
    .map((visit) => ({ visit, items: byChart.get(visit.id)! }));
}

const visitDate = (iso: string) => formatDate(iso, 'medium');

/**
 * "Image history": the patient's photos and radiographs from their other
 * visits, by visit date. Collapsed by default and loaded only when opened,
 * so a chart with a long history costs nothing until someone asks.
 * Read-only — images are changed from the visit they belong to.
 */
export const ImageHistory: React.FC<ImageHistoryProps> = ({ visits, onOpenVisit, toothLabel }) => {
  const { t } = useTranslation('media');
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Attachment[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [viewing, setViewing] = React.useState<number | null>(null);
  // Bumped by "Try again": a failed load leaves `items` null, so it can't be the trigger.
  const [attempt, setAttempt] = React.useState(0);
  const visitKey = visits.map((v) => v.id).sort().join(',');

  // Another patient or another set of visits: start over, closed.
  React.useEffect(() => {
    setOpen(false);
    setItems(null);
    setFailed(false);
    setViewing(null);
  }, [visitKey]);

  React.useEffect(() => {
    if (!open || items !== null) return;
    let cancelled = false;
    setFailed(false);
    listAttachmentsForCharts(visits.map((v) => v.id))
      .then((rows) => {
        if (cancelled) return;
        if (rows) setItems(rows);
        else setFailed(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visitKey stands for visits
  }, [open, items, visitKey, attempt]);

  const groups = React.useMemo(() => (items ? groupByVisit(visits, items) : []), [items, visits]);
  const flat = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const dateOf = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) for (const a of g.items) m.set(a.id, g.visit.date);
    return m;
  }, [groups]);

  if (visits.length === 0) return null;

  return (
    <section className="image-history">
      <button
        type="button"
        className="diagram-view__action image-history__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? t('history.hide') : t('history.show', { count: visits.length })}
      </button>

      {open && (
        <div className="image-history__body">
          {failed ? (
            <p className="login-error" role="alert">
              {t('history.failed')}{' '}
              <button type="button" className="image-history__retry" onClick={() => { setFailed(false); setItems(null); setAttempt((n) => n + 1); }}>
                {t('history.retry')}
              </button>
            </p>
          ) : items === null ? (
            <p className="practice-logo-empty">{t('history.loading')}</p>
          ) : groups.length === 0 ? (
            <p className="practice-logo-empty">{t('history.empty')}</p>
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
      )}

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
