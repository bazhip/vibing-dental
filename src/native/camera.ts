import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import i18n from '../i18n';
import { LocalizedError } from '../utils/apiErrors';

/** Open the camera; returns the shot as a JPEG File, or null if cancelled.
 *  Rejects when the shot can't be read back. */
export async function takePhoto(): Promise<File | null> {
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 90,
    });
    if (!photo.webPath) throw new LocalizedError(i18n.t('chart:imaging.cameraNoPhoto'));
    const res = await fetch(photo.webPath);
    if (!res.ok) throw new LocalizedError(i18n.t('chart:imaging.cameraReadFailed', { status: res.status }));
    const blob = await res.blob();
    return new File([blob], `photo-${Date.now()}.jpeg`, { type: 'image/jpeg' });
  } catch (err) {
    if (err instanceof Error && /cancel/i.test(err.message)) return null;
    throw err;
  }
}
