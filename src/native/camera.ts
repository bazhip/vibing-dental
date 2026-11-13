import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

/** Open the camera; returns the shot as a JPEG File, or null if cancelled. */
export async function takePhoto(): Promise<File | null> {
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 90,
    });
    if (!photo.webPath) return null;
    const blob = await (await fetch(photo.webPath)).blob();
    return new File([blob], `photo-${Date.now()}.jpeg`, { type: 'image/jpeg' });
  } catch (err) {
    if (err instanceof Error && /cancel/i.test(err.message)) return null;
    throw err;
  }
}
