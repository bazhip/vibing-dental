import { Capacitor } from '@capacitor/core';

/** Website origin for links that leave the app or go into emails. */
export const WEB_ORIGIN = 'https://toothops.app/';

/** True only inside the Capacitor iOS shell; false on the web. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Called once at startup. Marks <html> so CSS can adapt in the app. */
export function initNativeShell(): void {
  if (!isNativeApp()) return;
  document.documentElement.classList.add('native-ios');
}
