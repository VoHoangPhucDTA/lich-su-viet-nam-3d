import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadService(cloudName = 'demo') {
  vi.resetModules();
  vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', cloudName);
  return import('./cloudinaryService');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('getResponsiveCloudinaryImage', () => {
  it('adds bounded responsive delivery URLs to a standard public upload URL', async () => {
    const { getResponsiveCloudinaryImage } = await loadService();
    const image = getResponsiveCloudinaryImage(
      'https://res.cloudinary.com/demo/image/upload/events/photo.jpg',
      [640, 320],
    );

    expect(image).toEqual({
      src: 'https://res.cloudinary.com/demo/image/upload/c_limit,w_640/f_auto,q_auto/events/photo.jpg',
      srcSet:
        'https://res.cloudinary.com/demo/image/upload/c_limit,w_320/f_auto,q_auto/events/photo.jpg 320w, https://res.cloudinary.com/demo/image/upload/c_limit,w_640/f_auto,q_auto/events/photo.jpg 640w',
    });
  });

  it('preserves a version, nested public ID, extension, and query string', async () => {
    const { getResponsiveCloudinaryImage } = await loadService();
    const image = getResponsiveCloudinaryImage(
      'https://res.cloudinary.com/demo/image/upload/v1700000000/events/home/photo.png?download=1',
      [480],
    );

    expect(image).toEqual({
      src: 'https://res.cloudinary.com/demo/image/upload/c_limit,w_480/f_auto,q_auto/v1700000000/events/home/photo.png?download=1',
      srcSet:
        'https://res.cloudinary.com/demo/image/upload/c_limit,w_480/f_auto,q_auto/v1700000000/events/home/photo.png?download=1 480w',
    });
  });

  it('normalizes duplicate candidate widths without changing their source fallback', async () => {
    const { getResponsiveCloudinaryImage } = await loadService();
    const original = 'https://res.cloudinary.com/demo/image/upload/events/photo';
    const image = getResponsiveCloudinaryImage(original, [768, 360, 360, 480]);

    expect(image?.src).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_limit,w_480/f_auto,q_auto/events/photo',
    );
    expect(image?.srcSet).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_limit,w_360/f_auto,q_auto/events/photo 360w, https://res.cloudinary.com/demo/image/upload/c_limit,w_480/f_auto,q_auto/events/photo 480w, https://res.cloudinary.com/demo/image/upload/c_limit,w_768/f_auto,q_auto/events/photo 768w',
    );
  });

  it('keeps the original source when a layout profile supplies no usable width', async () => {
    const { getResponsiveCloudinaryImage } = await loadService();
    const original = 'https://res.cloudinary.com/demo/image/upload/events/photo.jpg';

    expect(getResponsiveCloudinaryImage(original, [0, -120, Number.NaN])).toEqual({ src: original });
  });

  it.each([
    'https://res.cloudinary.com/demo/image/upload/c_fill,w_480/f_auto,q_auto/events/photo.jpg',
    'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1700000000/events/photo.jpg',
    'https://res.cloudinary.com/demo/image/upload/bl_home-card/events/photo.jpg',
    'https://res.cloudinary.com/demo/image/upload/$card_width_480/ar_$card_width,c_fill/events/photo.jpg',
    'https://res.cloudinary.com/demo/image/upload/cs_srgb/events/photo.jpg',
    'https://res.cloudinary.com/demo/image/upload/dr_hdr/events/photo.jpg',
    'https://res.cloudinary.com/demo/image/upload/fn_wasm:thumbnail/events/photo.jpg',
    'https://res.cloudinary.com/demo/image/upload/fps_24/events/photo.gif',
    'https://res.cloudinary.com/demo/image/upload/s--abc123--/v1700000000/events/photo.jpg',
    'https://res.cloudinary.com/demo/image/private/v1700000000/events/photo.jpg',
    'https://res.cloudinary.com/demo/image/authenticated/v1700000000/events/photo.jpg',
    'https://res.cloudinary.com/demo/image/fetch/https://images.example.test/events/photo.jpg',
    'https://res.cloudinary.com/demo/video/upload/v1700000000/events/photo.jpg',
    'https://res.cloudinary.com/demo/raw/upload/v1700000000/events/photo.jpg',
    'https://res.cloudinary.com/demo/image/upload/v1700000000/events/photo.jpg?__cld_token__=opaque',
    'https://res.cloudinary.com/demo/image/upload/v1700000000/events/photo.jpg?AUTH_TOKEN=opaque',
    'https://res.cloudinary.com/demo/image/upload/v1700000000/events/photo.jpg?signature=opaque',
    'https://res.cloudinary.com/demo/image/upload/v1700000000/events/photo.jpg?expires_at=1',
    'https://user:password@res.cloudinary.com/demo/image/upload/v1700000000/events/photo.jpg',
    'https://res.cloudinary.com:8443/demo/image/upload/v1700000000/events/photo.jpg',
    'https://res.cloudinary.com/demo/image/upload//events/photo.jpg',
    'https://res.cloudinary.com/demo/image/upload/events/photo.jpg/',
    'https://res.cloudinary.com/demo/image/upload',
    'https://res.cloudinary.com/demo/image/upload/v1700000000',
    'http://res.cloudinary.com/demo/image/upload/v1700000000/events/photo.jpg',
    'https://images.example.test/events/photo.jpg',
    '/event-titles/photo.jpg',
    'not a URL',
  ])('keeps unsafe, already-transformed, non-Cloudinary, and malformed sources intact: %s', async (original) => {
    const { getResponsiveCloudinaryImage } = await loadService();

    expect(getResponsiveCloudinaryImage(original, [480])).toEqual({ src: original });
  });
});

describe('getEventThumbnailDeliveryCandidates', () => {
  it('keeps the legacy explicit-then-folder candidate order unchanged', async () => {
    const { getEventThumbnailDeliveryCandidates } = await loadService('demo-cloud');
    const explicit = 'https://images.example.test/explicit.jpg';

    expect(getEventThumbnailDeliveryCandidates('event-1', explicit)).toEqual([
      explicit,
      'https://res.cloudinary.com/demo-cloud/image/upload/historical_events_thumbnail1/event-1',
      'https://res.cloudinary.com/demo-cloud/image/upload/event-thumbnails/event-1',
      'https://res.cloudinary.com/demo-cloud/image/upload/historical_events_thumbnail/event-1',
    ]);
  });
});
