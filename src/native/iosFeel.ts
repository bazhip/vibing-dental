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

type SetStyle = (opts: { style: Style }) => Promise<void>;

/** Status bar text follows the system appearance: dark text over the
 *  light app, light text over the dark app — and switches live when the
 *  user (or Control Center / a schedule) flips the scheme. */
export function followColorSchemeForStatusBar(
  setStyle: SetStyle = (opts) => StatusBar.setStyle(opts),
  matchMedia: (q: string) => Pick<MediaQueryList, 'matches' | 'addEventListener'> =
    (q) => window.matchMedia(q),
): void {
  const apply = (dark: boolean) => {
    // Style.Dark = light text (for dark backgrounds); Style.Light = dark text.
    setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
  };
  const mql = matchMedia('(prefers-color-scheme: dark)');
  apply(mql.matches);
  mql.addEventListener('change', (e) => apply(e.matches));
}

/** Called once at startup, after initNativeShell(). No-op on the web. */
export function initIosFeel(): void {
  if (!isNativeApp()) return;
  followColorSchemeForStatusBar();
  Keyboard.addListener('keyboardDidShow', scrollFocusedCellIntoView).catch(() => {});
}

/** Called after the first React commit: swap the splash for the app. */
export function hideSplashAfterFirstRender(): void {
  if (!isNativeApp()) return;
  SplashScreen.hide().catch(() => {});
}
