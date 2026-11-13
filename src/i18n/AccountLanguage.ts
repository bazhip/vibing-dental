import { useChartSettings } from '../hooks/useChartSettings';
import { useAppLanguage } from './useAppLanguage';

/** Applies the signed-in account's language (else this device's) on screens shown
 *  instead of the chart, which normally owns it: the billing gate's paywall,
 *  Stripe return and failed-check screens. */
export function AccountLanguage(): null {
  const settings = useChartSettings(true);
  useAppLanguage(settings.prefs.language, settings.loaded);
  return null;
}
