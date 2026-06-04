/**
 * Bảng centroid (lat, lng) gần đúng của 63 tỉnh / thành phố trực thuộc trung
 * ương của Việt Nam, dùng làm vị trí FALLBACK khi 1 sự kiện chỉ có
 * `provinceNames` mà KHÔNG có `mapData.displayGeometry.marker`.
 *
 * Tọa độ là centroid hành chính ở mức "đủ tốt" để cam-fly tới và hiển thị
 * marker minh hoạ – không cần quá chính xác.
 *
 * Map được normalize key (lowercase + bỏ dấu) nên cả 'Hồ Chí Minh',
 * 'TP.HCM', 'TP HCM', 'Hồ Chí Minh City'… đều resolve được.
 */

export interface ProvinceCentroid {
  lat: number;
  lng: number;
  /** Tên hiển thị chuẩn để gắn vào label / popup nếu cần. */
  label: string;
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

/** Bỏ dấu tiếng Việt + ký tự đặc biệt để khớp tên không-dấu. */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bỏ combining diacritics
    .replace(/đ/g, 'd')
    .replace(/[.,/_–\-]/g, ' ')
    .replace(/\btp\b|\bthanh pho\b|\btinh\b/g, '') // bỏ prefix "TP", "Thành phố", "Tỉnh"
    .replace(/\s+/g, ' ')
    .trim();
}

/* ─── Bảng dữ liệu (63 tỉnh / thành) ─────────────────────────────────────── */

const PROVINCES: ProvinceCentroid[] = [
  // 5 thành phố trực thuộc trung ương
  { label: 'Hà Nội', lat: 21.0285, lng: 105.8542 },
  { label: 'TP. Hồ Chí Minh', lat: 10.7626, lng: 106.6602 },
  { label: 'Đà Nẵng', lat: 16.0471, lng: 108.2068 },
  { label: 'Hải Phòng', lat: 20.8449, lng: 106.6881 },
  { label: 'Cần Thơ', lat: 10.0452, lng: 105.7469 },

  // Bắc Bộ
  { label: 'Hà Giang', lat: 22.8030, lng: 104.9784 },
  { label: 'Cao Bằng', lat: 22.6356, lng: 106.2575 },
  { label: 'Bắc Kạn', lat: 22.1474, lng: 105.8348 },
  { label: 'Tuyên Quang', lat: 21.8237, lng: 105.2179 },
  { label: 'Lào Cai', lat: 22.4856, lng: 103.9707 },
  { label: 'Điện Biên', lat: 21.3856, lng: 103.0322 },
  { label: 'Lai Châu', lat: 22.3964, lng: 103.4707 },
  { label: 'Sơn La', lat: 21.3256, lng: 103.9188 },
  { label: 'Yên Bái', lat: 21.7168, lng: 104.8986 },
  { label: 'Hòa Bình', lat: 20.8170, lng: 105.3373 },
  { label: 'Thái Nguyên', lat: 21.5942, lng: 105.8480 },
  { label: 'Lạng Sơn', lat: 21.8537, lng: 106.7615 },
  { label: 'Quảng Ninh', lat: 21.0064, lng: 107.2926 },
  { label: 'Bắc Giang', lat: 21.2731, lng: 106.1948 },
  { label: 'Phú Thọ', lat: 21.4208, lng: 105.2046 },
  { label: 'Vĩnh Phúc', lat: 21.3608, lng: 105.5474 },
  { label: 'Bắc Ninh', lat: 21.1861, lng: 106.0763 },
  { label: 'Hải Dương', lat: 20.9373, lng: 106.3146 },
  { label: 'Hưng Yên', lat: 20.6464, lng: 106.0511 },
  { label: 'Thái Bình', lat: 20.4500, lng: 106.3408 },
  { label: 'Hà Nam', lat: 20.5835, lng: 105.9230 },
  { label: 'Nam Định', lat: 20.4385, lng: 106.1683 },
  { label: 'Ninh Bình', lat: 20.2506, lng: 105.9745 },

  // Bắc Trung Bộ
  { label: 'Thanh Hóa', lat: 19.8067, lng: 105.7852 },
  { label: 'Nghệ An', lat: 19.2342, lng: 104.9200 },
  { label: 'Hà Tĩnh', lat: 18.3559, lng: 105.8877 },
  { label: 'Quảng Bình', lat: 17.4685, lng: 106.6225 },
  { label: 'Quảng Trị', lat: 16.7404, lng: 107.1855 },
  { label: 'Thừa Thiên Huế', lat: 16.4637, lng: 107.5909 },

  // Nam Trung Bộ
  { label: 'Quảng Nam', lat: 15.5394, lng: 108.0191 },
  { label: 'Quảng Ngãi', lat: 15.1213, lng: 108.8044 },
  { label: 'Bình Định', lat: 13.7771, lng: 109.2231 },
  { label: 'Phú Yên', lat: 13.0882, lng: 109.0929 },
  { label: 'Khánh Hòa', lat: 12.2585, lng: 109.0526 },
  { label: 'Ninh Thuận', lat: 11.5645, lng: 108.9921 },
  { label: 'Bình Thuận', lat: 11.0904, lng: 108.0721 },

  // Tây Nguyên
  { label: 'Kon Tum', lat: 14.3497, lng: 108.0005 },
  { label: 'Gia Lai', lat: 13.8079, lng: 108.1098 },
  { label: 'Đắk Lắk', lat: 12.7100, lng: 108.2378 },
  { label: 'Đắk Nông', lat: 12.2646, lng: 107.6098 },
  { label: 'Lâm Đồng', lat: 11.9404, lng: 108.4583 },

  // Đông Nam Bộ
  { label: 'Bình Phước', lat: 11.7512, lng: 106.7235 },
  { label: 'Tây Ninh', lat: 11.3351, lng: 106.1098 },
  { label: 'Bình Dương', lat: 11.3254, lng: 106.4773 },
  { label: 'Đồng Nai', lat: 11.0686, lng: 107.1676 },
  { label: 'Bà Rịa - Vũng Tàu', lat: 10.5417, lng: 107.2429 },

  // Đồng bằng sông Cửu Long
  { label: 'Long An', lat: 10.5453, lng: 106.4117 },
  { label: 'Tiền Giang', lat: 10.4493, lng: 106.3420 },
  { label: 'Bến Tre', lat: 10.2433, lng: 106.3756 },
  { label: 'Trà Vinh', lat: 9.9477, lng: 106.3340 },
  { label: 'Vĩnh Long', lat: 10.2397, lng: 106.0379 },
  { label: 'Đồng Tháp', lat: 10.4938, lng: 105.6882 },
  { label: 'An Giang', lat: 10.5216, lng: 105.1259 },
  { label: 'Kiên Giang', lat: 9.8249, lng: 105.1259 },
  { label: 'Hậu Giang', lat: 9.7570, lng: 105.6412 },
  { label: 'Sóc Trăng', lat: 9.6033, lng: 105.9800 },
  { label: 'Bạc Liêu', lat: 9.2940, lng: 105.7244 },
  { label: 'Cà Mau', lat: 9.1761, lng: 105.1521 },
];

/* ─── Vùng / khu vực rộng (dùng khi provinceName là tên vùng) ───────────── */
const REGIONS: ProvinceCentroid[] = [
  { label: 'Bắc Bộ', lat: 21.0, lng: 105.8 },
  { label: 'Bắc Trung Bộ', lat: 18.5, lng: 105.7 },
  { label: 'Trung Bộ', lat: 16.0, lng: 108.0 },
  { label: 'Nam Trung Bộ', lat: 13.5, lng: 109.0 },
  { label: 'Tây Nguyên', lat: 13.5, lng: 108.0 },
  { label: 'Đông Nam Bộ', lat: 11.0, lng: 107.0 },
  { label: 'Nam Bộ', lat: 10.7, lng: 106.7 },
  { label: 'Tây Nam Bộ', lat: 10.0, lng: 105.5 },
  { label: 'Toàn quốc', lat: 16.0, lng: 107.5 },
];

/* ─── Aliases để khớp các biến thể tên ──────────────────────────────────── */
const ALIASES: Record<string, string> = {
  // Hồ Chí Minh
  'ho chi minh': 'TP. Hồ Chí Minh',
  'hcm': 'TP. Hồ Chí Minh',
  'tphcm': 'TP. Hồ Chí Minh',
  'sai gon': 'TP. Hồ Chí Minh',

  // Huế
  'hue': 'Thừa Thiên Huế',
  'thua thien hue': 'Thừa Thiên Huế',

  // Bà Rịa - Vũng Tàu (nhiều biến thể dấu nối)
  'ba ria vung tau': 'Bà Rịa - Vũng Tàu',
};

/* ─── Build lookup map (normalized → centroid) ──────────────────────────── */

const lookup = new Map<string, ProvinceCentroid>();
for (const p of PROVINCES) {
  lookup.set(normalize(p.label), p);
}
for (const r of REGIONS) {
  lookup.set(normalize(r.label), r);
}
for (const [aliasKey, canonical] of Object.entries(ALIASES)) {
  const target =
    PROVINCES.find((p) => p.label === canonical) ??
    REGIONS.find((r) => r.label === canonical);
  if (target) lookup.set(normalize(aliasKey), target);
}

/**
 * Lookup centroid theo tên tỉnh / vùng. Trả về `undefined` nếu không khớp.
 *
 * @example
 *   getProvinceCentroid('Quảng Ninh')   // → { lat: 21.00, lng: 107.29, ... }
 *   getProvinceCentroid('TP.HCM')       // → { lat: 10.76, lng: 106.66, ... }
 *   getProvinceCentroid('Nam Bộ')       // → { lat: 10.7,  lng: 106.7,  ... }
 */
export function getProvinceCentroid(
  name: string | null | undefined
): ProvinceCentroid | undefined {
  if (!name) return undefined;
  const key = normalize(name);
  return lookup.get(key);
}

/**
 * Lookup centroid cho cả 1 mảng tên (ưu tiên cái đầu tiên match được).
 * Trả về `undefined` nếu không có cái nào khớp.
 */
export function getCentroidFromProvinceNames(
  names: string[] | null | undefined
): ProvinceCentroid | undefined {
  if (!names) return undefined;
  for (const n of names) {
    const c = getProvinceCentroid(n);
    if (c) return c;
  }
  return undefined;
}
