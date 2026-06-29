/**
 * topicTaxonomy.mjs
 *
 * Canonical taxonomy cho ~30 chủ đề chính của môn Lịch sử lớp 12 (chương trình
 * GDPT 2018). Mục đích: gom 347 raw topic phân mảnh thành ~30 chủ đề chính cho
 * UI "Ôn theo chủ đề".
 *
 * Cách dùng:
 *   import { mapToCanonical, splitAndMapTopics, CANONICAL_TOPICS } from './lib/topicTaxonomy.mjs';
 *   const canonical = mapToCanonical("Kháng chiến chống Mỹ cứu nước 1954-1975");
 *   // → "Kháng chiến chống Mỹ 1954-1975"
 *
 * Quy tắc match:
 *   - Strip diacritics + lowercase + bỏ dấu câu để so sánh keyword.
 *   - Mỗi entry có `keywords[]`. Substring match → trả về `canonical`.
 *   - Thứ tự entry quan trọng: entry SPECIFIC đặt TRƯỚC entry GENERAL.
 *     Ví dụ: "Cách mạng tháng Tám" trước "Đảng Cộng sản Việt Nam".
 *   - Nếu không match → "Khác / Chưa phân loại".
 */

/** Strip dấu tiếng Việt + lowercase + collapse whitespace + bỏ dấu câu. */
export function normalizeForMatch(s) {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bỏ dấu kết hợp
    .replace(/đ/g, 'd')
    .replace(/[(),.!?;:"']/g, ' ')   // bỏ dấu câu
    .replace(/[-–—]/g, ' ')           // các loại gạch ngang
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Bảng taxonomy. Order matters: specific TRƯỚC, general SAU.
 *
 * `keywords`: tất cả là chuỗi đã được `normalizeForMatch` sẵn (không dấu, lowercase).
 */
export const TAXONOMY = [
  // ===== Lịch sử Việt Nam =====
  {
    canonical: 'Việt Nam thời cổ - trung đại',
    keywords: [
      'lich su viet nam thoi phong kien',
      'viet nam thoi phong kien',
      'viet nam co dai',
      'viet nam trung dai',
      'van lang',
      'au lac',
      'bac thuoc',
      'nha ly',
      'nha tran',
      'nha le',
      'nha nguyen',
      'tay son',
      'phong kien viet nam',
      // Các cuộc kháng chiến cổ trung đại
      'khang chien chong tong',
      'khang chien chong nguyen mong',
      'khang chien chong mong nguyen',
      'khang chien chong minh',
      'khoi nghia lam son',
      'dai viet thoi tran',
      'dai viet thoi ly',
      'viet nam the ky x',
      'viet nam the ky xi',
      'viet nam the ky xii',
      'viet nam the ky xiii',
      'viet nam the ky xiv',
      'viet nam the ky xv',
      'viet nam the ky xvi',
      'viet nam the ky xvii',
      'viet nam the ky xviii',
      'viet nam truoc 1945',
      'lich su quan su viet nam truoc 1945',
      'chien tranh bao ve to quoc thoi phong kien',
      'lich su viet nam tu the ky',
    ],
  },
  {
    canonical: 'Phong trào yêu nước đầu thế kỷ XX',
    keywords: [
      'phong trao yeu nuoc dau the ky',
      'phong trao yeu nuoc dau the ki',
      'dau the ky xx',
      'dau the ki xx',
      'phan boi chau',
      'phan chau trinh',
      'duy tan',
      'dong du',
    ],
  },
  {
    canonical: 'Nguyễn Ái Quốc – Hồ Chí Minh',
    keywords: [
      'nguyen ai quoc',
      'ho chi minh',
      'tim duong cuu nuoc',
      'hoat dong cua nguyen ai quoc',
    ],
  },
  {
    canonical: 'Phong trào dân tộc dân chủ 1919-1930',
    keywords: [
      'phong trao dan toc dan chu 1919',
      'phong trao dan toc dan chu',
      '1919 1930',
      '1919-1930',
      'viet nam 1919',
      'cong san viet nam ra doi',
      'thanh lap dang',
    ],
  },
  {
    canonical: 'Đảng Cộng sản Việt Nam',
    keywords: [
      'dang cong san viet nam',
      'dang cong san dong duong',
      'lich su dang',
      'dai hoi dai bieu cua dang',
      'dai hoi dang',
    ],
  },
  {
    canonical: 'Phong trào cách mạng 1930-1939',
    keywords: [
      'phong trao cach mang 1930',
      '1930 1931',
      'xo viet nghe tinh',
      'phong trao dan chu 1936',
      '1936 1939',
      '1930-1935',
      '1936-1939',
    ],
  },
  {
    canonical: 'Phong trào giải phóng dân tộc 1939-1945',
    keywords: [
      'phong trao giai phong dan toc 1939',
      '1939 1945',
      '1939-1945',
      'mat tran viet minh',
      'cao trao khang nhat cuu nuoc',
      'viet nam 1930 1945',
      'viet nam 1930-1945',
    ],
  },
  {
    canonical: 'Cách mạng tháng Tám 1945',
    keywords: [
      'cach mang thang tam',
      'cmt8',
      'tong khoi nghia thang tam',
      'thang tam 1945',
      'tuyen ngon doc lap',
    ],
  },
  {
    canonical: 'Việt Nam 1945-1946 (xây dựng & bảo vệ chính quyền)',
    keywords: [
      'viet nam 1945 1946',
      'viet nam 1945-1946',
      'xay dung chinh quyen',
      'bao ve chinh quyen cach mang',
      'sau cach mang thang tam',
    ],
  },
  {
    canonical: 'Kháng chiến chống Pháp 1945-1954',
    keywords: [
      'khang chien chong phap',
      'khang chien chong thuc dan phap',
      'khang chien toan quoc',
      '1945 1954',
      '1945-1954',
      'dien bien phu',
      'hiep dinh gio ne vo',
      'hiep dinh geneva',
      'chien dich viet bac',
      'chien dich bien gioi',
    ],
  },
  {
    canonical: 'Việt Nam 1954-1975 (xây dựng CNXH miền Bắc)',
    keywords: [
      'viet nam 1954 1975',
      'viet nam 1954-1975',
      'mien bac xay dung',
      'cnxh o mien bac',
      'hau phuong mien bac',
    ],
  },
  {
    canonical: 'Kháng chiến chống Mỹ 1954-1975',
    keywords: [
      'khang chien chong my',
      'khang chien chong de quoc my',
      'chong my cuu nuoc',
      'chien tranh viet nam',
      '1954 1975',
      '1954-1975',
      'tong tien cong va noi day',
      'mau than 1968',
      'dien bien phu tren khong',
      'hiep dinh pa ri',
      'hiep dinh paris',
      'dai thang mua xuan',
      '30 4 1975',
      '30-4-1975',
      'phong trao dong khoi',
      'dong khoi 1959',
      'dong khoi 1960',
      'chien tranh cuc bo',
      'viet nam hoa chien tranh',
      'chien tranh dac biet',
      'sau hiep dinh gio ne vo 1954',
      'sau hiep dinh giơnevơ 1954',
      'viet nam sau hiep dinh',
    ],
  },
  {
    canonical: 'Việt Nam 1975-1986 (thống nhất & khắc phục hậu quả)',
    keywords: [
      'viet nam sau 1975',
      'viet nam sau nam 1975',
      'viet nam 1975 1986',
      'viet nam 1975-1986',
      'viet nam tu 1975',
      'viet nam tu nam 1975',
      'thong nhat dat nuoc',
      'sau giai phong',
      'truoc doi moi',
      'chien tranh bien gioi tay nam',
      'chien tranh bien gioi phia bac',
      'bao ve bien gioi phia bac',
      'chien tranh bien gioi 1979',
    ],
  },
  {
    canonical: 'Công cuộc Đổi mới (1986-nay)',
    keywords: [
      'doi moi',
      'cong cuoc doi moi',
      'duong loi doi moi',
      'viet nam thoi ki doi moi',
      'viet nam thoi doi moi',
      '1986 nay',
      '1986-nay',
      '1986 den nay',
      '1986-den-nay',
      'doi moi va hoi nhap',
      'thanh tuu doi moi',
      'lich su viet nam tu 1986',
    ],
  },
  {
    canonical: 'Chủ quyền biển đảo Việt Nam',
    keywords: [
      'chu quyen bien dao',
      'bien dong',
      'truong sa',
      'hoang sa',
      'chu quyen lanh tho',
    ],
  },

  {
    canonical: 'Đường lối đối ngoại Việt Nam',
    keywords: [
      'doi ngoai viet nam',
      'ngoai giao viet nam',
      'doi ngoai cua viet nam',
      'duong loi doi ngoai',
      'chinh sach doi ngoai viet nam',
      'quan he quoc te cua viet nam',
      'quan he doi ngoai cua viet nam',
      'vi the viet nam trong quan he quoc te',
      'duong loi cach mang viet nam',
      'viet nam doi ngoai',
    ],
  },
  {
    canonical: 'Mặt trận dân tộc & đại đoàn kết',
    keywords: [
      'mat tran dan toc thong nhat',
      'mat tran dan toc',
      'dai doan ket dan toc',
      'dai doan ket toan dan',
      'chinh sach dan toc',
    ],
  },
  {
    canonical: 'Lịch sử Việt Nam tổng quát',
    keywords: [
      'lich su viet nam 1945',
      'lich su viet nam 1930',
      'lich su viet nam hien dai',
      'lich su viet nam tong quat',
      'lich su viet nam the ky xx',
      'khai quat lich su viet nam',
      'so sanh cac su kien lich su viet nam',
      'bai hoc lich su cua cach mang viet nam',
      'viet nam tu 1945 den nay',
      'viet nam hien dai',
      'lich su quan su viet nam',
      'viet nam 1945 1975',
      'lich su viet nam',
    ],
  },

  // ===== Lịch sử thế giới =====
  {
    canonical: 'Cách mạng tháng Mười Nga 1917',
    keywords: [
      'cach mang thang muoi nga',
      'cach mang thang 10 nga',
      'cach mang thang muoi 1917',
      'su ra doi cua nha nuoc xhcn dau tien',
    ],
  },
  {
    canonical: 'Chiến tranh thế giới thứ hai',
    keywords: [
      'chien tranh the gioi thu hai',
      'cttg ii',
      'cttg2',
      'the chien thu hai',
      'world war 2',
      'ww2',
      'chien tranh the gioi lan thu hai',
    ],
  },
  {
    canonical: 'Liên Xô và các nước Đông Âu',
    keywords: [
      'lien xo',
      'lien bang xo viet',
      'cccp',
      'dong au',
      'cac nuoc dong au',
      'su sup do cua lien xo',
      'he thong xa hoi chu nghia',
      'he thong xhcn',
    ],
  },
  {
    canonical: 'Mỹ – Tây Âu – Nhật Bản (1945-nay)',
    keywords: [
      'nuoc my sau chien tranh',
      'my sau chien tranh',
      'tay au',
      'cac nuoc tay au',
      'nhat ban',
      'lien minh chau au',
      'eu',
      'my la tinh',
      'cac nuoc tu ban',
    ],
  },
  {
    canonical: 'Trung Quốc',
    keywords: [
      'trung quoc',
      'cong hoa nhan dan trung hoa',
      'cach mang trung quoc',
      'cai cach mo cua trung quoc',
    ],
  },
  {
    canonical: 'Các nước Đông Nam Á',
    keywords: [
      'cac nuoc dong nam a',
      'dong nam a',
      'phong trao giai phong dan toc dong nam a',
    ],
  },
  {
    canonical: 'Các nước châu Á',
    keywords: [
      'cac nuoc chau a',
      'chau a',
      'cac nuoc a phi my latinh',
      'cac nuoc a phi',
    ],
  },
  {
    canonical: 'ASEAN',
    keywords: [
      'asean',
      'hiep hoi cac quoc gia dong nam a',
      'cong dong asean',
    ],
  },
  {
    canonical: 'Liên hợp quốc',
    keywords: [
      'lien hop quoc',
      'to chuc lien hop quoc',
      'un',
      'hien chuong lien hop quoc',
    ],
  },
  {
    canonical: 'Trật tự thế giới sau CTTG II',
    keywords: [
      'trat tu the gioi sau chien tranh the gioi thu hai',
      'trat tu hai cuc i an ta',
      'trat tu hai cuc ianta',
      'trat tu i an ta',
      'trat tu ianta',
      'hoi nghi i an ta',
      'hoi nghi ianta',
      'sau chien tranh the gioi thu hai',
      'sau cttg ii',
      'sau cttg2',
      'i an ta',
      'ianta',
      'trat tu the gioi hien nay',
      'trat tu the gioi moi',
    ],
  },
  {
    canonical: 'Chiến tranh lạnh',
    keywords: [
      'chien tranh lanh',
      'doi dau xo my',
      'doi dau dong tay',
      'khoi quan su nato',
      'khoi varsava',
      'khoi vacsava',
    ],
  },
  {
    canonical: 'Quan hệ quốc tế sau Chiến tranh lạnh',
    keywords: [
      'quan he quoc te sau chien tranh lanh',
      'the gioi sau chien tranh lanh',
      'trat tu the gioi sau chien tranh lanh',
      'da cuc nhieu trung tam',
      'hau chien tranh lanh',
      'quan he quoc te hien dai',
      'lich su the gioi hien dai',
    ],
  },
  {
    canonical: 'Quan hệ quốc tế sau CTTG II',
    keywords: [
      'quan he quoc te sau chien tranh the gioi thu hai',
      'quan he quoc te sau cttg',
      'quan he quoc te 1945',
    ],
  },
  {
    canonical: 'Phong trào giải phóng dân tộc thế giới (Á-Phi-Mỹ Latinh)',
    keywords: [
      'phong trao giai phong dan toc',
      'a phi my la tinh',
      'a phi my latinh',
      'cac nuoc a phi',
      'cac nuoc my la tinh',
    ],
  },
  {
    canonical: 'Cách mạng khoa học – công nghệ',
    keywords: [
      'cach mang khoa hoc',
      'cach mang cong nghe',
      'kh kt',
      'kh-cn',
      'khoa hoc ki thuat',
      'cong nghe thong tin',
      'cuoc cach mang 4 0',
    ],
  },
  {
    canonical: 'Toàn cầu hóa & hội nhập',
    keywords: [
      'toan cau hoa',
      'globalization',
      'hoi nhap quoc te',
      'xu the toan cau',
    ],
  },
  {
    canonical: 'Chủ nghĩa xã hội (lý luận & thực tiễn)',
    keywords: [
      'chu nghia xa hoi',
      'cnxh',
      'chu nghia xhcn',
      'ly luan lich su',
      'su hinh thanh he thong xa hoi chu nghia',
    ],
  },
  {
    canonical: 'Hồ Chí Minh & tư tưởng',
    keywords: [
      'tu tuong ho chi minh',
      'tu tuong hcm',
    ],
  },
];

/** Fallback bucket. */
export const FALLBACK_CANONICAL = 'Khác / Chưa phân loại';

/** Lấy tất cả canonical names (cho UI/test). */
export const CANONICAL_TOPICS = [
  ...TAXONOMY.map((t) => t.canonical),
  FALLBACK_CANONICAL,
];

/**
 * Map 1 raw topic string → 1 canonical topic.
 * @param {string} rawTopic
 * @returns {string}
 */
export function mapToCanonical(rawTopic) {
  if (!rawTopic) return FALLBACK_CANONICAL;
  const norm = normalizeForMatch(rawTopic);
  if (!norm) return FALLBACK_CANONICAL;
  for (const entry of TAXONOMY) {
    for (const kw of entry.keywords) {
      if (norm.includes(kw)) return entry.canonical;
    }
  }
  return FALLBACK_CANONICAL;
}

/**
 * Tách raw topic theo dấu phẩy, map từng phần, dedupe → list canonical topics.
 * 1 câu có thể thuộc nhiều canonical → trả về tất cả (set unique).
 *
 * @param {string} rawTopic
 * @returns {string[]}
 */
export function splitAndMapTopics(rawTopic) {
  if (!rawTopic) return [FALLBACK_CANONICAL];
  const parts = rawTopic
    .split(/[,;|]/g)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return [FALLBACK_CANONICAL];
  const canonicals = new Set();
  for (const part of parts) {
    canonicals.add(mapToCanonical(part));
  }
  // Nếu chỉ có FALLBACK + thứ khác → bỏ FALLBACK
  if (canonicals.size > 1) canonicals.delete(FALLBACK_CANONICAL);
  return [...canonicals];
}
