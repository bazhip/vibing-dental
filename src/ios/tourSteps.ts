import type { TFunction } from 'i18next';
import type { Step } from '../components/WalkthroughModal';

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

export function buildAppSteps(t: TFunction<'settings'>, aiEnabled?: boolean): Step[] {
  const step = (key: Key, rest: Omit<Step, 'title' | 'body'> = {}): Step => ({
    ...rest,
    title: t(`tour.steps.${key}.title`),
    body: t(`tour.steps.${key}.body`),
  });
  return [
    step('welcome'),
    step('sections', { section: 'patient', target: '[data-app-tab="chart"] .ios-navbar__title-button', placement: 'bottom' }),
    step('patient', { section: 'patient', target: 'input[placeholder="Enter patient name"]', placement: 'bottom' }),
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
