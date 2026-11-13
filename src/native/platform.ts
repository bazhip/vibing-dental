import { Capacitor } from '@capacitor/core';
import { isIosPreview } from '../ios/preview';

/** Website origin for links that leave the app or go into emails. */
export const WEB_ORIGIN = 'https://toothops.app/';

/** True only inside the Capacitor iOS shell; false on the web. (Also true
 *  in the DEV-only `?iosPreview=1` browser preview — never in production.) */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform() || isIosPreview();
}

/** Called once at startup. Marks <html> so CSS can adapt in the app.
 *  (Auth-return listening is started separately from index.tsx so this
 *  module stays a leaf that supabaseClient can import without a cycle.) */
export function initNativeShell(): void {
  if (!isNativeApp()) return;
  document.documentElement.classList.add('native-ios');
  // DEV preview in a desktop browser: lets tokens.css pin the iPhone's
  // default text size, which -apple-system-body doesn't give on macOS.
  if (isIosPreview()) document.documentElement.classList.add('ios-preview');
  // Edge-to-edge under the notch/home indicator. App only: the website keeps
  // its original viewport, so browsers never extend under the safe areas.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta && !/viewport-fit=/.test(meta.content)) {
    meta.content = `${meta.content}, viewport-fit=cover`;
  }
}
