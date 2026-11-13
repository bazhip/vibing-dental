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
  | 'welcome' | 'sections' | 'patient' | 'species' | 'grid' | 'diagrams'
  | 'codes' | 'treatment' | 'patients' | 'dictate' | 'settings' | 'share';

/** Steps worded exactly as the website's tour reuse its text
 *  (onboarding:walkthrough.steps); the rest speak touch or name app-only
 *  places (settings:tour.steps). */
const WEB_TITLE: ReadonlySet<Key> = new Set(['welcome', 'sections', 'patient', 'species', 'grid', 'diagrams', 'codes', 'treatment', 'dictate', 'settings']);
const WEB_BODY: ReadonlySet<Key> = new Set(['welcome', 'patient', 'species', 'dictate', 'settings']);
type WebKey = 'welcome' | 'sections' | 'patient' | 'species' | 'grid' | 'diagrams' | 'codes' | 'treatment' | 'dictate' | 'settings';
type AppTitleKey = 'patients' | 'share';
type AppBodyKey = 'sections' | 'grid' | 'diagrams' | 'codes' | 'treatment' | 'patients' | 'share';

export function buildAppSteps(t: TFunction<'settings'>, aiEnabled?: boolean): TourStep[] {
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
    step('species', { section: 'patient', target: '.patient-form__selectors', placement: 'top' }),
    step('grid', { section: 'charting', target: '.dental-grid', placement: 'top' }),
    step('diagrams', { section: 'diagnosis', target: '.tooth-diagram-wrapper', placement: 'bottom' }),
    step('codes', { section: 'diagnosis', target: '.diagram-with-codes__codes', placement: 'top' }),
    step('treatment', { section: 'treatment', target: '.dental-grid-section', placement: 'top' }),
    step('patients', { target: tab('patients'), placement: 'top' }),
    ...(aiEnabled ? [step('dictate', { target: '.voice-input', placement: 'top' })] : []),
    step('settings', { target: tab('settings'), placement: 'top' }),
    step('share', { target: '[data-app-tab="chart"] button[type="submit"][form="chart-form"]', placement: 'bottom' }),
  ];
}
