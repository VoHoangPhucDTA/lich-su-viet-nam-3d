const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET ?? '';
const EVENT_THUMBNAIL_FOLDERS = [
  'historical_events_thumbnail1',
  'event-thumbnails',
  'historical_events_thumbnail',
] as const;

const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
const CLOUDINARY_DELIVERY_HOST = 'res.cloudinary.com';
const CLOUDINARY_IMAGE_RESOURCE_TYPE = 'image';
const CLOUDINARY_UPLOAD_DELIVERY_TYPE = 'upload';
const SIGNED_DELIVERY_SEGMENT = /^s--[A-Za-z0-9_-]+--$/;
const VERSION_SEGMENT = /^v\d+$/;
const TRANSFORMATION_QUALIFIER_PREFIXES = [
  'a_',
  'ac_',
  'af_',
  'ar_',
  'b_',
  'bl_',
  'bo_',
  'br_',
  'c_',
  'co_',
  'cs_',
  'd_',
  'dl_',
  'dn_',
  'dpr_',
  'dr_',
  'du_',
  'e_',
  'eo_',
  'f_',
  'fl_',
  'fn_',
  'fps_',
  'g_',
  'h_',
  'if_',
  'ki_',
  'l_',
  'o_',
  'p_',
  'pg_',
  'q_',
  'r_',
  'so_',
  'sp_',
  't_',
  'u_',
  'vc_',
  'vs_',
  'w_',
  'x_',
  'y_',
  'z_',
] as const;
const PROTECTED_QUERY_PARAMETER_NAMES = new Set([
  '__cld_token__',
  'auth_token',
  'expires_at',
  'signature',
  'token',
]);

export interface ResponsiveCloudinaryImage {
  src: string;
  srcSet?: string;
}

function encodePublicId(publicId: string): string {
  return publicId
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function isTransformationSegment(segment: string): boolean {
  if (segment.startsWith('$')) return true;

  return segment
    .split(',')
    .some((qualifier) =>
      TRANSFORMATION_QUALIFIER_PREFIXES.some((prefix) => qualifier.startsWith(prefix))
    );
}

function getTransformableCloudinaryUrl(source: string): URL | undefined {
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    return undefined;
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname.toLowerCase() !== CLOUDINARY_DELIVERY_HOST ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname.includes('//') ||
    parsed.pathname.endsWith('/')
  ) {
    return undefined;
  }

  if (
    [...parsed.searchParams.keys()].some((name) =>
      PROTECTED_QUERY_PARAMETER_NAMES.has(name.toLowerCase())
    )
  ) {
    return undefined;
  }

  const segments = parsed.pathname.slice(1).split('/');
  const [cloudName, resourceType, deliveryType, firstDeliverySegment] = segments;
  if (
    !cloudName ||
    resourceType !== CLOUDINARY_IMAGE_RESOURCE_TYPE ||
    deliveryType !== CLOUDINARY_UPLOAD_DELIVERY_TYPE ||
    !firstDeliverySegment ||
    segments.slice(3).some((segment) => SIGNED_DELIVERY_SEGMENT.test(segment))
  ) {
    return undefined;
  }

  // A transformation must appear before a version or public ID. Returning the
  // original is safer than attempting to merge/deduplicate an existing chain.
  if (isTransformationSegment(firstDeliverySegment)) return undefined;

  const publicIdStart = VERSION_SEGMENT.test(firstDeliverySegment) ? 4 : 3;
  if (segments.length <= publicIdStart) return undefined;

  return parsed;
}

function normalizedCandidateWidths(widths: readonly number[]): number[] {
  return [...new Set(
    widths
      .filter((width) => Number.isFinite(width))
      .map((width) => Math.round(width))
      .filter((width) => width > 0)
  )].sort((left, right) => left - right);
}

function withResponsiveDeliveryTransform(source: URL, width: number): string {
  const segments = source.pathname.slice(1).split('/');
  const transformedSegments = [
    ...segments.slice(0, 3),
    `c_limit,w_${width}`,
    'f_auto,q_auto',
    ...segments.slice(3),
  ];
  const transformed = new URL(source.toString());
  transformed.pathname = `/${transformedSegments.join('/')}`;
  return transformed.toString();
}

/**
 * Builds responsive public Cloudinary delivery URLs without changing the
 * source/fallback URL when its delivery semantics cannot be proven safe.
 */
export function getResponsiveCloudinaryImage(
  sourceUrl?: string | null,
  widths: readonly number[] = []
): ResponsiveCloudinaryImage | undefined {
  const source = sourceUrl?.trim();
  if (!source) return undefined;

  const candidateWidths = normalizedCandidateWidths(widths);
  const cloudinaryUrl = getTransformableCloudinaryUrl(source);
  if (!cloudinaryUrl || candidateWidths.length === 0) return { src: source };

  const transformedUrls = candidateWidths.map((width) => ({
    width,
    url: withResponsiveDeliveryTransform(cloudinaryUrl, width),
  }));
  const defaultSource = transformedUrls[Math.floor(transformedUrls.length / 2)];

  return {
    src: defaultSource.url,
    srcSet: transformedUrls.map(({ width, url }) => `${url} ${width}w`).join(', '),
  };
}

export function getEventThumbnailDeliveryUrl(
  eventId?: string | null,
  explicitUrl?: string | null
): string | undefined {
  return getEventThumbnailDeliveryCandidates(eventId, explicitUrl)[0];
}

export function getEventThumbnailDeliveryCandidates(
  eventId?: string | null,
  explicitUrl?: string | null
): string[] {
  const candidates: string[] = [];
  const addCandidate = (url?: string | null) => {
    const normalized = url?.trim();
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  };

  const existingUrl = explicitUrl?.trim();
  addCandidate(existingUrl);

  const key = eventId?.trim();
  if (!CLOUD_NAME || !key) return candidates;

  for (const folder of EVENT_THUMBNAIL_FOLDERS) {
    addCandidate(`https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${encodePublicId(
      `${folder}/${key}`
    )}`);
  }

  return candidates;
}

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
