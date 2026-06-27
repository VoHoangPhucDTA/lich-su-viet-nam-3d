const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET ?? '';

const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

/**
 * Upload an image file to Cloudinary using an unsigned upload preset.
 *
 * @returns The secure Cloudinary URL of the uploaded image, or `null` if upload fails / env vars missing.
 */
export async function uploadAvatarImage(file: File): Promise<string | null> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    console.warn('[Cloudinary] VITE_CLOUDINARY_CLOUD_NAME or VITE_CLOUDINARY_UPLOAD_PRESET not set.');
    return null;
  }

  const body = new FormData();
  body.append('file', file);
  body.append('upload_preset', UPLOAD_PRESET);
  body.append('folder', 'avatars');

  try {
    const res = await fetch(UPLOAD_URL, { method: 'POST', body });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('[Cloudinary] Upload failed:', res.status, errBody);
      return null;
    }
    const data = await res.json();
    return (data.secure_url as string) ?? null;
  } catch (err) {
    console.error('[Cloudinary] Network error:', err);
    return null;
  }
}
