/**
 * DEV-only iOS preview: open the dev server with `?iosPreview=1` to render
 * the app as it looks inside the iOS shell (html.native-ios, tokens, dark
 * mode via the browser's color scheme) without building to a device.
 * Remembered for the browser tab; `?iosPreview=0` turns it off.
 *
 * `import.meta.env.DEV` is a build-time constant, so production bundles
 * compile this to `return false` and the preview can never switch on there.
 */
const KEY = 'toothops:iosPreview';

export function isIosPreview(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    const param = new URLSearchParams(window.location.search).get('iosPreview');
    if (param === '1') {
      sessionStorage.setItem(KEY, '1');
      return true;
    }
    if (param === '0') {
      sessionStorage.removeItem(KEY);
      return false;
    }
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
