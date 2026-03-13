import type { HistoricalEvent } from '../types/event';

export const HISTORICAL_EVENTS: HistoricalEvent[] = [
  // ============== GIAI ĐOẠN 1: CÁCH MẠNG THÁNG TÁM 1945 ==============
  {
    id: 'cmtt-1945',
    name: 'Cách mạng Tháng Tám 1945',
    description:
      'Cuộc cách mạng do Đảng Cộng sản Đông Dương và Mặt trận Việt Minh lãnh đạo, lật đổ chế độ phong kiến và ách thống trị thực dân, giành độc lập cho Việt Nam.',
    startYear: 1945,
    endYear: 1945,
    eventType: 'political',
    eventSubtype: 'Cách mạng',
    geoType: 'nationwide',
    coordinates: { lat: 21.0285, lng: 105.8542 },
    parentId: null,
    details:
      'Cách mạng Tháng Tám năm 1945 là cuộc cách mạng giải phóng dân tộc, lật đổ ách thống trị gần 100 năm của thực dân Pháp và phát xít Nhật, chấm dứt chế độ quân chủ hàng nghìn năm, lập nên nước Việt Nam Dân chủ Cộng hòa – nhà nước dân chủ nhân dân đầu tiên ở Đông Nam Á.',
    children: [
      {
        id: 'cmtt-hanoi',
        name: 'Khởi nghĩa giành chính quyền ở Hà Nội',
        description:
          'Ngày 19/8/1945, hàng vạn người dân Hà Nội xuống đường biểu tình, chiếm Phủ Khâm sai, Trại Bảo an binh, Sở Cảnh sát, giành chính quyền thắng lợi.',
        startYear: 1945,
        eventType: 'political',
        eventSubtype: 'Khởi nghĩa',
        geoType: 'single_point',
        coordinates: { lat: 21.0285, lng: 105.8542 },
        primaryRegions: ['Hà Nội'],
        parentId: 'cmtt-1945',
        details:
          'Sáng 19/8/1945, hàng vạn nhân dân nội ngoại thành với cờ đỏ sao vàng, biểu ngữ tiến về Quảng trường Nhà hát Lớn. Cuộc mít tinh biến thành biểu tình vũ trang, nhân dân xông vào chiếm các cơ quan đầu não của chính quyền bù nhìn.',
      },
      {
        id: 'cmtt-tuyen-ngon',
        name: 'Tuyên ngôn Độc lập 2/9/1945',
        description:
          'Chủ tịch Hồ Chí Minh đọc Tuyên ngôn Độc lập tại Quảng trường Ba Đình, khai sinh nước Việt Nam Dân chủ Cộng hòa.',
        startYear: 1945,
        eventType: 'political',
        eventSubtype: 'Tuyên ngôn',
        geoType: 'single_point',
        coordinates: { lat: 21.0367, lng: 105.8345 },
        primaryRegions: ['Hà Nội'],
        parentId: 'cmtt-1945',
        details:
          'Ngày 2/9/1945, tại Quảng trường Ba Đình (Hà Nội), Chủ tịch Hồ Chí Minh thay mặt Chính phủ lâm thời đọc bản Tuyên ngôn Độc lập, trịnh trọng tuyên bố trước quốc dân và thế giới: Nước Việt Nam Dân chủ Cộng hòa ra đời.',
      },
      {
        id: 'cmtt-hue',
        name: 'Khởi nghĩa giành chính quyền ở Huế',
        description:
          'Ngày 23/8/1945, nhân dân Huế nổi dậy giành chính quyền, buộc vua Bảo Đại thoái vị.',
        startYear: 1945,
        eventType: 'political',
        eventSubtype: 'Khởi nghĩa',
        geoType: 'single_point',
        coordinates: { lat: 16.4637, lng: 107.5909 },
        primaryRegions: ['Thừa Thiên Huế'],
        parentId: 'cmtt-1945',
        details:
          'Ngày 23/8/1945, hàng vạn nhân dân Huế khởi nghĩa giành chính quyền. Ngày 30/8/1945, vua Bảo Đại tuyên bố thoái vị, trao ấn kiếm cho đại diện Chính phủ lâm thời.',
      },
      {
        id: 'cmtt-saigon',
        name: 'Khởi nghĩa giành chính quyền ở Sài Gòn',
        description:
          'Ngày 25/8/1945, nhân dân Sài Gòn nổi dậy giành chính quyền thắng lợi.',
        startYear: 1945,
        eventType: 'political',
        eventSubtype: 'Khởi nghĩa',
        geoType: 'single_point',
        coordinates: { lat: 10.8231, lng: 106.6297 },
        primaryRegions: ['Hồ Chí Minh'],
        parentId: 'cmtt-1945',
        details:
          'Ngày 25/8/1945, hơn một triệu nhân dân Sài Gòn – Chợ Lớn xuống đường biểu tình, giành chính quyền. Cuộc khởi nghĩa ở Sài Gòn hoàn thành thắng lợi, chính quyền cách mạng được thiết lập.',
      },
    ],
  },

  // ============== GIAI ĐOẠN 2: KHÁNG CHIẾN CHỐNG PHÁP ==============
  {
    id: 'kc-chong-phap',
    name: 'Kháng chiến chống Pháp (1946-1954)',
    description:
      'Cuộc kháng chiến toàn dân, toàn diện chống thực dân Pháp xâm lược, kéo dài 9 năm, kết thúc bằng chiến thắng Điện Biên Phủ lịch sử.',
    startYear: 1946,
    endYear: 1954,
    eventType: 'military',
    eventSubtype: 'Chiến tranh',
    geoType: 'multi_region',
    coordinates: { lat: 21.0285, lng: 105.8542 },
    primaryRegions: ['Hà Nội', 'Điện Biên'],
    secondaryRegions: ['Cao Bằng', 'Lạng Sơn', 'Tuyên Quang', 'Thái Nguyên'],
    parentId: null,
    details:
      'Kháng chiến chống Pháp (1946-1954) là cuộc đấu tranh vũ trang lâu dài của dân tộc Việt Nam chống thực dân Pháp xâm lược. Dưới sự lãnh đạo của Đảng và Chủ tịch Hồ Chí Minh, quân dân ta đã vượt qua muôn vàn khó khăn, giành thắng lợi vẻ vang.',
    children: [
      {
        id: 'vb-thu-dong-1947',
        name: 'Chiến dịch Việt Bắc Thu - Đông 1947',
        description:
          'Chiến dịch phản công đánh bại cuộc tiến công quy mô lớn của Pháp lên căn cứ địa Việt Bắc.',
        startYear: 1947,
        eventType: 'military',
        eventSubtype: 'Chiến dịch quân sự',
        geoType: 'multi_region',
        coordinates: { lat: 22.1565, lng: 105.8437 },
        primaryRegions: ['Tuyên Quang', 'Thái Nguyên', 'Bắc Kạn'],
        secondaryRegions: ['Cao Bằng', 'Lạng Sơn'],
        parentId: 'kc-chong-phap',
        details:
          'Thu Đông 1947, thực dân Pháp huy động lực lượng lớn tiến công lên Việt Bắc nhằm tiêu diệt cơ quan đầu não kháng chiến. Quân dân ta đã đánh bại cuộc tiến công, bảo vệ vững chắc căn cứ địa cách mạng, đánh dấu sự thất bại chiến lược của Pháp.',
      },
      {
        id: 'bien-gioi-1950',
        name: 'Chiến dịch Biên giới Thu - Đông 1950',
        description:
          'Chiến dịch tiến công khai thông biên giới Việt – Trung, giải phóng vùng biên giới phía Bắc.',
        startYear: 1950,
        eventType: 'military',
        eventSubtype: 'Chiến dịch quân sự',
        geoType: 'multi_region',
        coordinates: { lat: 22.6657, lng: 106.2522 },
        primaryRegions: ['Cao Bằng', 'Lạng Sơn'],
        secondaryRegions: ['Bắc Giang', 'Quảng Ninh'],
        parentId: 'kc-chong-phap',
        details:
          'Chiến dịch Biên giới Thu Đông 1950 (16/9 - 14/10/1950) do Đại tướng Võ Nguyên Giáp trực tiếp chỉ huy. Quân ta giải phóng Đông Khê, Thất Khê, khai thông biên giới Việt – Trung, mở rộng liên lạc quốc tế.',
      },
      {
        id: 'dien-bien-phu',
        name: 'Chiến dịch Điện Biên Phủ 1954',
        description:
          'Trận quyết chiến chiến lược kết thúc cuộc kháng chiến chống Pháp, buộc Pháp ký Hiệp định Genève.',
        startYear: 1954,
        eventType: 'military',
        eventSubtype: 'Trận đánh',
        geoType: 'single_point',
        coordinates: { lat: 21.383, lng: 103.016 },
        primaryRegions: ['Điện Biên'],
        parentId: 'kc-chong-phap',
        details:
          'Chiến dịch Điện Biên Phủ (13/3 - 7/5/1954) là đỉnh cao của cuộc kháng chiến chống Pháp. Quân ta đã tiêu diệt hoàn toàn tập đoàn cứ điểm Điện Biên Phủ, bắt sống tướng De Castries, kết thúc thắng lợi cuộc kháng chiến 9 năm.',
        children: [
          {
            id: 'dbp-dot-1',
            name: 'Đợt tấn công thứ nhất (13-17/3/1954)',
            description:
              'Quân ta tiêu diệt cứ điểm Him Lam và Độc Lập, làm chủ phía Bắc.',
            startYear: 1954,
            eventType: 'military',
            eventSubtype: 'Đợt tấn công',
            geoType: 'single_point',
            coordinates: { lat: 21.405, lng: 103.005 },
            primaryRegions: ['Điện Biên'],
            parentId: 'dien-bien-phu',
            details:
              'Đợt 1 (13-17/3/1954): Quân ta tiêu diệt 2 cứ điểm kiên cố Him Lam và Độc Lập ở phía Bắc, đại tá Piroth – chỉ huy pháo binh Pháp tự sát vì bất lực.',
          },
          {
            id: 'dbp-dot-2',
            name: 'Đợt tấn công thứ hai (30/3 - 30/4/1954)',
            description:
              'Quân ta đánh chiếm các cứ điểm phía Đông, siết chặt vòng vây.',
            startYear: 1954,
            eventType: 'military',
            eventSubtype: 'Đợt tấn công',
            geoType: 'single_point',
            coordinates: { lat: 21.39, lng: 103.025 },
            primaryRegions: ['Điện Biên'],
            parentId: 'dien-bien-phu',
            details:
              'Đợt 2 (30/3 - 30/4/1954): Quân ta đánh chiếm các cứ điểm phía Đông (đồi A1, C1, D1, E1), thu hẹp phạm vi chiếm đóng của Pháp. Trận chiến trên đồi A1 kéo dài 38 ngày đêm ác liệt.',
          },
          {
            id: 'dbp-dot-3',
            name: 'Đợt tấn công thứ ba (1-7/5/1954)',
            description:
              'Tổng công kích, tiêu diệt hoàn toàn tập đoàn cứ điểm, bắt sống tướng De Castries.',
            startYear: 1954,
            eventType: 'military',
            eventSubtype: 'Đợt tấn công',
            geoType: 'single_point',
            coordinates: { lat: 21.383, lng: 103.016 },
            primaryRegions: ['Điện Biên'],
            parentId: 'dien-bien-phu',
            details:
              'Đợt 3 (1-7/5/1954): Tổng công kích toàn mặt trận. Chiều 7/5/1954, ta đánh chiếm sở chỉ huy của Pháp, bắt sống tướng De Castries cùng toàn bộ ban tham mưu, kết thúc chiến dịch.',
          },
        ],
      },
    ],
  },

  // ============== HIỆP ĐỊNH GENÈVE ==============
  {
    id: 'hiep-dinh-geneve',
    name: 'Hiệp định Genève 1954',
    description:
      'Hiệp định chấm dứt chiến tranh, lập lại hòa bình ở Đông Dương, chia Việt Nam thành 2 miền tại vĩ tuyến 17.',
    startYear: 1954,
    eventType: 'political',
    eventSubtype: 'Hiệp định',
    geoType: 'no_location',
    parentId: null,
    details:
      'Hiệp định Genève (21/7/1954) là kết quả của Hội nghị Genève về Đông Dương. Hiệp định công nhận độc lập, chủ quyền, thống nhất và toàn vẹn lãnh thổ của Việt Nam; quy định lấy vĩ tuyến 17 làm giới tuyến quân sự tạm thời; tổng tuyển cử thống nhất đất nước vào tháng 7/1956.',
  },

  // ============== GIAI ĐOẠN 3: KHÁNG CHIẾN CHỐNG MỸ ==============
  {
    id: 'kc-chong-my',
    name: 'Kháng chiến chống Mỹ cứu nước (1954-1975)',
    description:
      'Cuộc kháng chiến trường kỳ chống đế quốc Mỹ xâm lược, thống nhất đất nước, kết thúc bằng Chiến dịch Hồ Chí Minh 1975.',
    startYear: 1954,
    endYear: 1975,
    eventType: 'military',
    eventSubtype: 'Chiến tranh',
    geoType: 'multi_region',
    coordinates: { lat: 16.0, lng: 108.0 },
    primaryRegions: ['Hồ Chí Minh', 'Hà Nội'],
    secondaryRegions: ['Quảng Trị', 'Bình Phước', 'Tây Ninh', 'Đà Nẵng'],
    parentId: null,
    details:
      'Kháng chiến chống Mỹ cứu nước (1954-1975) là cuộc đấu tranh vĩ đại của dân tộc Việt Nam chống đế quốc Mỹ xâm lược. Qua 21 năm kiên cường, quân dân ta đã đánh bại hoàn toàn cuộc chiến tranh xâm lược, giải phóng miền Nam, thống nhất đất nước.',
    children: [
      {
        id: 'dong-khoi-1960',
        name: 'Phong trào Đồng Khởi (1959-1960)',
        description:
          'Phong trào nổi dậy đồng loạt của nhân dân miền Nam, đánh dấu bước chuyển từ đấu tranh chính trị sang kết hợp vũ trang.',
        startYear: 1959,
        endYear: 1960,
        eventType: 'military',
        eventSubtype: 'Khởi nghĩa',
        geoType: 'multi_region',
        coordinates: { lat: 10.2432, lng: 106.3752 },
        primaryRegions: ['Bến Tre'],
        secondaryRegions: ['Long An', 'Tiền Giang', 'Trà Vinh'],
        parentId: 'kc-chong-my',
        details:
          'Phong trào Đồng Khởi bùng nổ từ Bến Tre (17/1/1960), lan rộng ra khắp miền Nam. Nhân dân nổi dậy phá thế kìm kẹp, giải phóng nhiều vùng nông thôn. Phong trào đánh dấu bước chuyển cách mạng miền Nam từ thế giữ gìn lực lượng sang thế tiến công.',
      },
      {
        id: 'tong-tan-cong-1968',
        name: 'Tổng tiến công Tết Mậu Thân 1968',
        description:
          'Cuộc tổng tiến công và nổi dậy đồng loạt trên toàn miền Nam vào dịp Tết Mậu Thân 1968.',
        startYear: 1968,
        eventType: 'military',
        eventSubtype: 'Chiến dịch quân sự',
        geoType: 'multi_region',
        coordinates: { lat: 10.8231, lng: 106.6297 },
        primaryRegions: ['Hồ Chí Minh', 'Huế'],
        secondaryRegions: ['Đà Nẵng', 'Cần Thơ', 'Nha Trang'],
        parentId: 'kc-chong-my',
        details:
          'Đêm 30 rạng sáng 31/1/1968, quân giải phóng đồng loạt tấn công vào hầu hết các đô thị, thị xã trên toàn miền Nam. Tại Sài Gòn, đặc công đánh vào Đại sứ quán Mỹ, Dinh Độc Lập. Tại Huế, quân ta làm chủ thành phố trong 25 ngày.',
      },
      {
        id: 'chien-dich-hcm',
        name: 'Chiến dịch Hồ Chí Minh (26/4 - 30/4/1975)',
        description:
          'Chiến dịch cuối cùng giải phóng Sài Gòn, thống nhất đất nước.',
        startYear: 1975,
        eventType: 'military',
        eventSubtype: 'Chiến dịch quân sự',
        geoType: 'multi_region',
        coordinates: { lat: 10.7769, lng: 106.7009 },
        primaryRegions: ['Hồ Chí Minh'],
        secondaryRegions: ['Bình Dương', 'Long An', 'Bình Phước', 'Tây Ninh', 'Đồng Nai'],
        parentId: 'kc-chong-my',
        details:
          'Chiến dịch Hồ Chí Minh (26/4 - 30/4/1975) là chiến dịch cuối cùng của cuộc kháng chiến chống Mỹ. 5 cánh quân đồng loạt tiến vào Sài Gòn. 11 giờ 30 phút ngày 30/4/1975, xe tăng quân giải phóng húc đổ cổng Dinh Độc Lập, Tổng thống Dương Văn Minh tuyên bố đầu hàng vô điều kiện.',
      },
    ],
  },
];

// Flatten all events into a single array for easier searching
export function getAllEvents(): HistoricalEvent[] {
  const result: HistoricalEvent[] = [];

  function traverse(events: HistoricalEvent[]) {
    for (const event of events) {
      result.push(event);
      if (event.children) {
        traverse(event.children);
      }
    }
  }

  traverse(HISTORICAL_EVENTS);
  return result;
}

// Get only root-level events (parentId === null)
export function getRootEvents(): HistoricalEvent[] {
  return HISTORICAL_EVENTS;
}

// Find event by ID
export function findEventById(id: string): HistoricalEvent | undefined {
  return getAllEvents().find((e) => e.id === id);
}

// Get events within a year range
export function getEventsByYear(year: number): HistoricalEvent[] {
  return HISTORICAL_EVENTS.filter((e) => {
    const endYear = e.endYear || e.startYear;
    return e.startYear <= year && endYear >= year;
  });
}

// Get timeline range
export const TIMELINE_MIN_YEAR = 1945;
export const TIMELINE_MAX_YEAR = 1975;
