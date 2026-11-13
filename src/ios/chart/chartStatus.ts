import type { TFunction } from 'i18next';

/**
 * The Chart tab's navigation bar subtitle: what the save is doing, or the
 * saved-visit state. Same decisions, in the same order, as the website's
 * save-status pill in EntryGrid's topbar.
 */

export interface ChartStatusInput {
  cloudEnabled: boolean;
  trial: boolean;
  status: 'idle' | 'saving' | 'saved' | 'error';
  saveError: string;
  /** Why a save was blocked (e.g. no patient name). */
  saveHint: string;
  readOnly: boolean;
  viewingSavedVisit: boolean;
  editingSavedVisit: boolean;
  dirty: boolean;
  online: boolean;
  hasName: boolean;
  awaitingClinical: boolean;
  /** ISO time of the last cloud save ('' = never). */
  lastSavedAt: string;
  /** The visit date (yyyy-mm-dd). */
  visitDate: string;
  /** The last save was one the user asked for (Save now, Try again,
   *  Done): announce it. Autosaves are not announced. */
  announceSaved?: boolean;
}

export interface ChartStatus {
  /** Subtitle ('' = none). */
  text: string;
  tone: 'normal' | 'error';
  /** Error detail for the inline notice. */
  detail?: string;
  /** A failed save the user can retry. */
  retry?: boolean;
  /** Kept on this device until charting starts; Save now puts it in the cloud. */
  canSaveNow?: boolean;
  /** For the polite live region: failures, going offline, and an
   *  explicit save — never the autosave's Saving…/Saved. */
  live: string;
}

export interface ChartStatusFormat {
  time(iso: string): string;
  date(ymd: string): string;
}

export function chartStatus(i: ChartStatusInput, t: TFunction<'chart'>, fmt: ChartStatusFormat): ChartStatus {
  const live = !i.cloudEnabled
    ? ''
    : i.status === 'error'
    ? i.saveError || t('ios.live.notSaved')
    : i.status === 'saved' && i.announceSaved
    ? t('ios.live.saved')
    : i.status !== 'saving' && i.dirty && !i.online
    ? t('ios.status.offline')
    : '';
  const base = ((): Omit<ChartStatus, 'live'> => {
    if (!i.cloudEnabled) return { text: i.trial ? t('ios.status.onDevice') : '', tone: 'normal' };
    if (i.status === 'saving') return { text: t('ios.status.saving'), tone: 'normal' };
    if (i.status === 'error') return { text: t('ios.status.notSaved'), tone: 'error', detail: i.saveError, retry: true };
    if (i.saveHint) return { text: t('ios.status.notSaved'), tone: 'error', detail: i.saveHint, retry: false };
    if (i.readOnly) {
      return {
        text: i.viewingSavedVisit && i.visitDate ? t('ios.status.viewOnlyDate', { date: fmt.date(i.visitDate) }) : t('ios.status.viewOnly'),
        tone: 'normal',
      };
    }
    if (i.dirty && !i.online) return { text: t('ios.status.offline'), tone: 'normal' };
    if (i.dirty && !i.hasName) return { text: t('ios.status.needsName'), tone: 'normal' };
    if (i.awaitingClinical) return { text: t('ios.status.keptOnDevice'), tone: 'normal', canSaveNow: true };
    if (i.dirty) return { text: t('ios.status.unsaved'), tone: 'normal' };
    if (i.lastSavedAt) return { text: t('ios.status.saved', { time: fmt.time(i.lastSavedAt) }), tone: 'normal' };
    return { text: '', tone: 'normal' };
  })();
  if (i.editingSavedVisit) {
    return {
      ...base,
      text: base.text ? t('ios.status.editingWith', { status: base.text }) : t('ios.status.editing'),
      live,
    };
  }
  return { ...base, live };
}
