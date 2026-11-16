import type { TFunction } from 'i18next';
import type { TourStep } from '../components/WalkthroughModal';

/**
 * The product tour's steps in the iOS app. Same order and sections as the
 * website's (`buildSteps`), but the copy speaks touch (tap, no ⌘ or Tab
 * keys) and every target is a piece of the app's chrome: the chart's title
 * menu, the Patients and Settings tabs (or sidebar items on iPad), and the
 * Share button. A target that isn't on screen shows the step centred.
 */

const tab = (id: string) => `.ios-tabbar [data-tab="${id}"], .ios-appshell__item[data-tab="${id}"]`;

type Key =
  | 'welcome' | 'sections' | 'patient' | 'grid' | 'byTooth' | 'customize' | 'diagrams'
  | 'images' | 'treatment' | 'ownerReport' | 'patients' | 'dictate' | 'settings' | 'share';

/** Steps worded exactly as the website's tour reuse its text
 *  (onboarding:walkthrough.steps); the rest speak touch or name app-only
 *  places (settings:tour.steps). */
const WEB_TITLE: ReadonlySet<Key> = new Set(['welcome', 'sections', 'patient', 'grid', 'byTooth', 'customize', 'diagrams', 'images', 'treatment', 'ownerReport', 'dictate', 'settings']);
const WEB_BODY: ReadonlySet<Key> = new Set(['welcome', 'patient', 'images', 'ownerReport', 'dictate', 'settings']);
type WebKey = 'welcome' | 'sections' | 'patient' | 'grid' | 'byTooth' | 'customize' | 'diagrams' | 'images' | 'treatment' | 'ownerReport' | 'dictate' | 'settings';
type AppTitleKey = 'patients' | 'share';
type AppBodyKey = 'sections' | 'grid' | 'byTooth' | 'customize' | 'diagrams' | 'treatment' | 'patients' | 'share';

export function buildAppSteps(t: TFunction<'settings'>, aiEnabled?: boolean, ownerReportEnabled?: boolean): TourStep[] {
  const step = (key: Key, rest: Omit<TourStep, 'title' | 'body'> = {}): TourStep => ({
    ...rest,
    title: WEB_TITLE.has(key)
      ? t(`walkthrough.steps.${key as WebKey}.title`, { ns: 'onboarding' })
      : t(`tour.steps.${key as AppTitleKey}.title`),
    body: WEB_BODY.has(key)
      ? t(`walkthrough.steps.${key as WebKey}.body`, { ns: 'onboarding' })
      : t(`tour.steps.${key as AppBodyKey}.body`),
  });
  return [
    step('welcome'),
    step('sections', { section: 'patient', target: '[data-app-tab="chart"] .ios-navbar__title-button', placement: 'bottom' }),
    step('patient', { section: 'patient', target: '[data-tour="patient-name"]', placement: 'bottom' }),
    step('grid', { section: 'charting', target: '.dental-grid, .tooth-chart', placement: 'top' }),
    step('byTooth', { section: 'charting', target: '.charting-view-switch', placement: 'bottom' }),
    step('customize', { section: 'charting', target: '[data-app-tab="chart"] .ios-navbar__trailing', placement: 'bottom' }),
    step('diagrams', { section: 'diagnosis', target: '.tooth-diagram-wrapper', placement: 'bottom' }),
    step('images', { section: 'imaging', target: '.radiographic-findings', placement: 'bottom' }),
    step('treatment', { section: 'treatment', target: '.surgery-report__header', placement: 'bottom' }),
    ...(ownerReportEnabled ? [step('ownerReport', { section: 'owner-report', target: '.owner-report__block', placement: 'top' })] : []),
    step('patients', { target: tab('patients'), placement: 'top' }),
    ...(aiEnabled ? [step('dictate', { target: '.voice-input', placement: 'top' })] : []),
    step('settings', { target: tab('settings'), placement: 'top' }),
    step('share', { target: '[data-app-tab="chart"] button[type="submit"][form="chart-form"]', placement: 'bottom' }),
  ];
}
