import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard } from '@capacitor/keyboard';
import { isNativeApp } from './platform';

/**
 * iOS-only polish that needs the native plugins: status bar text colour,
 * splash hand-off, and keeping the field being typed into visible above
 * the keyboard. Kept apart from platform.ts so that module stays
 * plugin-free (its tests mock @capacitor/core wholesale).
 */

/** Keyboard avoidance: bring the focused grid cell (or field) into view. */
export function scrollFocusedCellIntoView(): void {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || el === document.body) return;
  const target = el.closest<HTMLElement>('.rdg-cell') ?? el;
  target.scrollIntoView({ block: 'nearest' });
}

/** Called once at startup, after initNativeShell(). No-op on the web. */
export function initIosFeel(): void {
  if (!isNativeApp()) return;
  // Dark text: the app's chrome is light.
  StatusBar.setStyle({ style: Style.Light }).catch(() => {});
  Keyboard.addListener('keyboardDidShow', scrollFocusedCellIntoView).catch(() => {});
}

/** Called after the first React commit: swap the splash for the app. */
export function hideSplashAfterFirstRender(): void {
  if (!isNativeApp()) return;
  SplashScreen.hide().catch(() => {});
}
