/**
 * Title image mapping for historical events.
 *
 * Maps event IDs/slugs to their hero/title images stored in /public/event-titles/.
 * Images should be 1200×630px (2:1 aspect ratio), museum-quality,
 * matching the visual language of the lsvn3d reference project.
 *
 * ## Naming convention for new images:
 *     /public/event-titles/{event-slug}.jpg
 *
 * ## Style requirements:
 *     - Traditional Vietnamese atmosphere
 *     - Warm golden lighting, painterly realism
 *     - Ancient architecture, historical landscapes, traditional clothing
 *     - Museum exhibition / premium documentary quality
 *     - Consistent composition and color grading across all images
 *
 * To add new images: place .jpg files in frontend/public/event-titles/
 * and add entries below using the event slug as key.
 */

const eventTitleImages: Record<string, string> = {
  // ─── Existing high-quality banner images ────────────────────────────────

  /** Ngô Quyền chiến thắng Bạch Đằng 938 */
  'bach-dang-938-ngo-quyen-xung-vuong': '/event-titles/bach-dang-938.jpg',

  /** Thời đại Hùng Vương dựng nước Văn Lang */
  'nuoc-van-lang-ra-doi': '/event-titles/hung-vuong.jpg',
  'tin-nguong-tho-hung-vuong': '/event-titles/hung-vuong.jpg',

  /** An Dương Vương xây dựng nước Âu Lạc */
  'nuoc-au-lac-ra-doi': '/event-titles/an-duong-vuong.jpg',
  'xay-dung-thanh-co-loa': '/event-titles/an-duong-vuong.jpg',

  /** Lý Công Uẩn dời đô về Thăng Long */
  'doi-do-thang-long': '/event-titles/doi-do-thang-long.jpg',

  /** Quang Trung – Ngọc Hồi – Đống Đa */
  'khang-chien-chong-thanh-1789': '/event-titles/ngoc-hoi-dong-da.jpg',
  'phong-trao-tay-son': '/event-titles/ngoc-hoi-dong-da.jpg',
  'tay-son-gd1-1771-1777': '/event-titles/ngoc-hoi-dong-da.jpg',

  /** Tuyên ngôn độc lập 2/9/1945 */
  'tuyen-ngon-doc-lap-1945': '/event-titles/tuyen-ngon-doc-lap-1945.jpg',
  'cach-mang-thang-tam-1945': '/event-titles/tuyen-ngon-doc-lap-1945.jpg',

  // ─── New event images — add actual .jpg files to public/event-titles/ ──
  //
  // These entries are ACTIVE but point to image files that do not yet exist
  // in public/event-titles/. They will use gradient fallbacks until real
  // images are added. Place 1200×630px .jpg files in public/event-titles/
  // with the filenames below to activate them.

  /** Chiến dịch Điện Biên Phủ 1954 */
  'chien-dich-dien-bien-phu-1954': '/event-titles/dien-bien-phu.jpg',

  /** Chiến dịch Hồ Chí Minh 1975 */
  'chien-dich-ho-chi-minh-1975': '/event-titles/ho-chi-minh-1975.jpg',

  /** Thành lập Đảng CSVN 1930 */
  'thanh-lap-dang-csvn-1930': '/event-titles/dang-csvn-1930.jpg',

  /** Toàn quốc kháng chiến 19/12/1946 */
  'toan-quoc-khang-chien-19-12-1946': '/event-titles/toan-quoc-khang-chien.jpg',

  /** Hiệp định Paris 1973 */
  'hiep-dinh-paris-1973': '/event-titles/hiep-dinh-paris.jpg',

  /** Đổi mới 1986 */
  'doi-moi-1986-collection': '/event-titles/doi-moi-1986.jpg',

  /** Việt Nam gia nhập ASEAN 1995 */
  'vn-gia-nhap-asean-1995': '/event-titles/vn-asean.jpg',
};

/**
 * Returns the title image path for an event, or undefined if none exists.
 * Checks both exact slug and the underscore-variant for backward compatibility.
 */
export function getEventTitleImage(slugOrId: string): string | undefined {
  return eventTitleImages[slugOrId] ?? eventTitleImages[slugOrId.replace(/-/g, '_')];
}

/**
 * Returns a fallback gradient string for events without title images.
 * The gradient is based on event type for visual variety.
 */
export function getEventTitleFallback(eventType: string): string {
  const gradients: Record<string, string> = {
    military: 'linear-gradient(135deg, #7a1515, #4a0a0a)',
    political: 'linear-gradient(135deg, #1a3a5c, #0f2440)',
    economic: 'linear-gradient(135deg, #8a6b2b, #5a4218)',
    cultural: 'linear-gradient(135deg, #1a4a3a, #0f3028)',
  };
  return gradients[eventType] || 'linear-gradient(135deg, #1c1917, #292524)';
}
