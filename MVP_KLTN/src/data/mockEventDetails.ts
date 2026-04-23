import type { EventType } from '../types/event';

export interface MockEventDetail {
  id: string;
  slug: string;
  entityType: 'event';
  eventLevel: 'collection' | 'atomic';
  titles: {
    primary: string;
    short?: string;
    alternatives?: string[];
  };
  classification: {
    eventType: EventType;
    eventSubtype?: string;
    tags?: string[];
  };
  coverage: {
    grades: string[];
  };
  chronology: {
    start: string;
    end?: string;
    datePrecision: string;
    displayDate: string;
  };
  mapData?: {
    displayGeometry?: {
      geoType: 'single_point' | 'multi_region' | 'nationwide' | 'no_location';
      marker?: {
        coordinates: [number, number]; // [lng, lat]
      };
      provinceNames?: string[];
      historicalLocations?: string[];
    };
    focusGeometry?: {
      center: [number, number];
      zoom: number;
    };
  };
  summary: {
    homepageTitle: string;
    homepageSummary: string;
    cardSummary: string;
  };
  textbookContent: {
    canonicalSummary: string;
    detailedNarrative?: string;
    significance?: string;
    keyFacts?: string[];
    textbookRefs?: {
      grade: string;
      book: string;
      theme?: string;
      lesson?: string;
      pageStart?: number;
      pageEnd?: number;
      excerpt?: string;
    }[];
  };
  externalContent?: {
    wikipedia?: {
      title: string;
      url: string;
    };
    wikidata?: {
      url: string;
    };
    otherSources?: {
      name: string;
      url: string;
    }[];
  };
  media?: {
    thumbnail?: string;
    items?: {
      id: string;
      type: 'image' | 'video' | 'document';
      url: string;
      caption?: string;
    }[];
  };
  hierarchy?: {
    rootId?: string;
    parentId?: string;
    childIds?: string[];
    level?: number;
    orderInParent?: number;
  };
  associations?: {
    relatedEventIds?: string[];
    relatedFigureIds?: string[];
    predecessorEventIds?: string[];
    successorEventIds?: string[];
  };
  display: {
    showOnHomepage: boolean;
    showOnTimeline: boolean;
    featured: boolean;
  };
  sourcePolicy: {
    canonicalSource: string;
    supplementalSources?: string[];
  };
}

export const mockEventsData: Record<string, MockEventDetail> = {
  'chien-dich-dien-bien-phu-1954': {
    id: 'dien-bien-phu',
    slug: 'chien-dich-dien-bien-phu-1954',
    entityType: 'event',
    eventLevel: 'atomic',
    titles: {
      primary: 'Chiến dịch Điện Biên Phủ (1954)',
      short: 'Chiến dịch Điện Biên Phủ',
      alternatives: ['Trận Điện Biên Phủ'],
    },
    classification: {
      eventType: 'military',
      eventSubtype: 'Chiến dịch quân sự',
      tags: ['kháng chiến chống Pháp', 'chiến dịch lịch sử'],
    },
    coverage: {
      grades: ['Lớp 9', 'Lớp 12'],
    },
    chronology: {
      start: '1954-03-13',
      end: '1954-05-07',
      datePrecision: 'day',
      displayDate: '13/03/1954 - 07/05/1954',
    },
    mapData: {
      displayGeometry: {
        geoType: 'single_point',
        marker: {
          coordinates: [103.0135, 21.3855],
        },
        provinceNames: ['Điện Biên'],
        historicalLocations: ['Tập đoàn cứ điểm Điện Biên Phủ', 'Mường Thanh'],
      },
      focusGeometry: {
        center: [103.0135, 21.3855],
        zoom: 12,
      },
    },
    summary: {
      homepageTitle: 'Chiến dịch Điện Biên Phủ',
      homepageSummary: 'Đòn quyết chiến chiến lược kết thúc thắng lợi cuộc kháng chiến chống thực dân Pháp.',
      cardSummary: 'Trận đánh lớn nhất và là thắng lợi quân sự quan trọng nhất của Việt Minh trong cuộc kháng chiến chống thực dân Pháp.',
    },
    textbookContent: {
      canonicalSummary: 'Chiến dịch Điện Biên Phủ (từ 13/3 đến 7/5/1954) là chiến dịch lớn nhất trong kháng chiến chống Pháp, tiêu diệt hoàn toàn tập đoàn cứ điểm mạnh nhất của Pháp ở Đông Dương.',
      detailedNarrative: 'Chiến dịch được chia làm 3 đợt:\n- Đợt 1 (13-17/3): Tiêu diệt cụm cứ điểm Him Lam và đồi Độc Lập, bức hàng Bản Kéo.\n- Đợt 2 (30/3-26/4): Bắn tỉa, tiến công các điểm cao phía đông phân khu trung tâm (A1, C1, C2, E1...).\n- Đợt 3 (1-7/5): Đồng loạt tấn công các phân khu còn lại. Chiều 7/5, tướng De Castries cùng toàn bộ bộ tham mưu Pháp đầu hàng.',
      significance: 'Đập tan hoàn toàn kế hoạch Navarre và mọi ý chí xâm lược của thực dân Pháp. Xoay chuyển cục diện chiến tranh, tạo điều kiện thuận lợi cho cuộc đấu tranh ngoại giao của ta ở hội nghị Geneva. Góp phần làm sụp đổ chủ nghĩa thực dân cũ trên thế giới.',
      keyFacts: [
        'Kéo dài 56 ngày đêm',
        'Tiêu diệt và bắt sống trên 16.200 tên địch',
        'Bắt sống tướng De Castries',
        'Góp phần quyết định tới Hiệp định Geneva'
      ],
      textbookRefs: [
        {
          grade: 'Lớp 12',
          book: 'Lịch sử 12 (Cơ bản)',
          lesson: 'Bài 20: Cuộc kháng chiến toàn quốc chống thực dân Pháp kết thúc (1953-1954)',
          pageStart: 147,
          pageEnd: 152
        }
      ]
    },
    externalContent: {
      wikipedia: {
        title: 'Chiến dịch Điện Biên Phủ',
        url: 'https://vi.wikipedia.org/wiki/Chi%E1%BA%BFn_d%E1%BB%8Bch_%C4%90i%E1%BB%87n_Bi%C3%AAn_Ph%E1%BB%A7'
      }
    },
    media: {
      thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Laotien1954.jpg/300px-Laotien1954.jpg'
    },
    hierarchy: {
      parentId: 'kc-chong-phap'
    },
    display: {
      showOnHomepage: true,
      showOnTimeline: true,
      featured: true
    },
    sourcePolicy: {
      canonicalSource: 'Sách giáo khoa Lịch sử'
    }
  },
  'khang-chien-chong-phap-1945-1954': {
    id: 'kc-chong-phap',
    slug: 'khang-chien-chong-phap-1945-1954',
    entityType: 'event',
    eventLevel: 'collection',
    titles: {
      primary: 'Kháng chiến chống thực dân Pháp (1945–1954)',
      short: 'Kháng chiến chống Pháp'
    },
    classification: {
      eventType: 'military',
      tags: ['kháng chiến', 'toàn quốc kháng chiến']
    },
    coverage: {
      grades: ['Lớp 9', 'Lớp 12']
    },
    chronology: {
      start: '1945-09-02',
      end: '1954-07-21',
      datePrecision: 'year',
      displayDate: '1945 - 1954'
    },
    mapData: {
      displayGeometry: {
        geoType: 'nationwide'
      }
    },
    summary: {
      homepageTitle: 'Kháng chiến chống Pháp',
      homepageSummary: 'Cuộc kháng chiến 9 năm bảo vệ nền độc lập dân tộc.',
      cardSummary: 'Cuộc kháng chiến bắt đầu từ ngày Nam Bộ kháng chiến (23/9/1945) và Toàn quốc kháng chiến (19/12/1946) đến khi ký Hiệp định Geneva (1954).'
    },
    textbookContent: {
      canonicalSummary: 'Kháng chiến chống Pháp trường kỳ, gian khổ của nhân dân Việt Nam dưới sự lãnh đạo của Đảng và Chủ tịch Hồ Chí Minh, đi từ thế phòng ngự sang cầm cự và tổng phản công.',
      significance: 'Bảo vệ được thành quả Cách mạng tháng Tám, hoàn thành giải phóng miền Bắc, tạo cơ sở để giải phóng hoàn toàn miền Nam sau này.',
      textbookRefs: [
        {
          grade: 'Lớp 12',
          book: 'Lịch sử 12 (Cơ bản)',
          theme: 'Việt Nam từ năm 1945 đến năm 1954'
        }
      ]
    },
    hierarchy: {
      childIds: ['dien-bien-phu']
    },
    display: {
      showOnHomepage: true,
      showOnTimeline: true,
      featured: false
    },
    sourcePolicy: {
      canonicalSource: 'Sách giáo khoa'
    }
  },
  'hoi-nghi-ianta-1945': {
    id: 'hoi-nghi-ianta',
    slug: 'hoi-nghi-ianta-1945',
    entityType: 'event',
    eventLevel: 'atomic',
    titles: {
      primary: 'Hội nghị I-an-ta (Tháng 2/1945)',
      short: 'Hội nghị I-an-ta'
    },
    classification: {
      eventType: 'political',
      tags: ['lịch sử thế giới', 'chiến tranh thế giới thứ 2']
    },
    coverage: {
      grades: ['Lớp 12']
    },
    chronology: {
      start: '1945-02-04',
      end: '1945-02-11',
      datePrecision: 'day',
      displayDate: '04/02/1945 - 11/02/1945'
    },
    mapData: {
      displayGeometry: {
        geoType: 'no_location'
      }
    },
    summary: {
      homepageTitle: 'Hội nghị I-an-ta',
      homepageSummary: 'Hội nghị của 3 cường quốc Liên Xô, Mỹ, Anh định hình trật tự thế giới mới.',
      cardSummary: 'Hội nghị cấp cao đánh dấu sự hình thành trật tự hai cực I-an-ta sau Chiến tranh thế giới thứ hai.'
    },
    textbookContent: {
      canonicalSummary: 'Hội nghị được tổ chức tại I-an-ta (Liên Xô) gồm nguyên thủ 3 cường quốc Liên Xô, Mỹ, Anh nhằm giải quyết những vấn đề bức thiết sau chiến tranh.',
      detailedNarrative: 'Nội dung hội nghị:\n- Thống nhất mục tiêu chung là tiêu diệt tận gốc chủ nghĩa phát xít Đức và chủ nghĩa quân phiệt Nhật Bản.\n- Thành lập tổ chức Liên Hợp Quốc nhằm duy trì hòa bình, an ninh thế giới.\n- Thỏa thuận về việc đóng quân, phân chia phạm vi ảnh hưởng ở châu Âu và châu Á.',
      significance: 'Những quyết định của Hội nghị I-an-ta cùng những thỏa thuận sau đó của 3 cường quốc đã trở thành khuôn khổ của trật tự thế giới mới, thường được gọi là "Trật tự hai cực I-an-ta".'
    },
    externalContent: {
      wikipedia: {
        title: 'Hội nghị Yalta',
        url: 'https://vi.wikipedia.org/wiki/H%E1%BB%99i_ngh%E1%BB%8B_Yalta'
      }
    },
    display: {
      showOnHomepage: false,
      showOnTimeline: true,
      featured: false
    },
    sourcePolicy: {
      canonicalSource: 'Sách giáo khoa Lịch sử lớp 12'
    }
  }
};
