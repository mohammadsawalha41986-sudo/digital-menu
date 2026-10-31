/**
 * Making a photo small enough to send from a phone, in the browser, before
 * it is uploaded: at most 2000px on its longest side, WebP (or JPEG where the
 * browser cannot write WebP) at quality 0.85 — enough to keep the texture of
 * food natural rather than smoothed. The server converts and resizes again
 * either way; this only saves the owner's data and waiting time.
 *
 * Browser-only (canvas). A file the browser cannot decode — HEIC on most
 * desktop browsers — is returned as it is, for the server to judge.
 */

const MAX_SIDE = 2000;

/** A smaller WebP (JPEG where the browser cannot write WebP), or the original if it cannot be read. */
export async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const encode = (type: string) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
    let blob = await encode('image/webp');
    // A browser that cannot write WebP hands back PNG, which is larger.
    if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg');
    if (!blob || blob.size >= file.size) return file;
    const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + `.${extension}`, { type: blob.type });
  } catch {
    return file;
  }
}

/** Formats the picker offers; HEIC/HEIF depend on the device converting them. */
export const ACCEPTED_IMAGES = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

/** The upload limit, matching the server's request limit with room to spare. */
export const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
