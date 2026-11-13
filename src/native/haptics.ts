import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNativeApp } from './platform';

/** Light tap for selections. No-op on web; never throws. */
export function hapticTap(): void {
  try {
    if (!isNativeApp()) return;
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  } catch {
    /* haptics are best-effort */
  }
}

/** Success buzz (e.g. after saving a PDF). No-op on web; never throws. */
export function hapticSuccess(): void {
  try {
    if (!isNativeApp()) return;
    Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
  } catch {
    /* haptics are best-effort */
  }
}

/** Selection tick (tab switch, picker/segment change, toggle). No-op on
 *  web; never throws. */
export function hapticSelection(): void {
  try {
    if (!isNativeApp()) return;
    Haptics.selectionStart()
      .then(() => Haptics.selectionChanged())
      .then(() => Haptics.selectionEnd())
      .catch(() => undefined);
  } catch {
    /* haptics are best-effort */
  }
}

/** Medium impact (a context menu opening on long-press). No-op on web. */
export function hapticImpact(): void {
  try {
    if (!isNativeApp()) return;
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
  } catch {
    /* haptics are best-effort */
  }
}
