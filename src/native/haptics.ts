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
