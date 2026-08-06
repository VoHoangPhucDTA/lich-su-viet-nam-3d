export type TerrainRelevance = 'decisive' | 'contextual';

export type PreferredTerrainTarget = {
  kind: 'region';
  gadmRef: string;
};

export interface TerrainInsight {
  canonicalSlug: string;
  relevance: TerrainRelevance;
  ctaLabel?: string;
  preferredInitialTarget?: PreferredTerrainTarget;
  headline: string;
  explanation: string;
  observePoints: readonly string[];
  sourceRef: string;
  scopeNote?: string;
}

export const TERRAIN_INSIGHTS: readonly TerrainInsight[] = [
  {
    canonicalSlug: 'chien-dich-dien-bien-phu-1954',
    relevance: 'contextual',
    ctaLabel: 'Xem không gian diễn biến chiến dịch',
    headline: 'Chiến dịch Điện Biên Phủ diễn ra qua ba đợt',
    explanation:
      'SGK cho biết Chiến dịch Điện Biên Phủ diễn ra qua ba đợt, từ ngày 13-3-1954 đến ngày 7-5-1954.',
    observePoints: [
      'Quan sát vị trí tương đối của Him Lam, Đồi Độc Lập, Bản Kéo và Mường Thanh.',
      'So sánh khoảng cách giữa các địa điểm vòng ngoài với khu vực trung tâm Mường Thanh.',
      'Ước lượng sự phân bố của các địa điểm khi chuyển giữa góc nhìn toàn bộ và từng điểm.',
    ],
    sourceRef:
      'SGK Lịch sử 12 – Kết nối tri thức với cuộc sống – Bài 7, tr. 38',
    scopeNote:
      'Danh sách địa điểm lấy từ dữ liệu bản đồ của đề tài và không biểu diễn thứ tự từng đợt tiến công.',
  },
  {
    canonicalSlug: 'khang-chien-chong-quan-nguyen-1287-1288',
    relevance: 'contextual',
    ctaLabel: 'Xem không gian các trận đánh 1287–1288',
    headline: 'Vân Đồn, Vạn Kiếp và Bạch Đằng trong cuộc kháng chiến 1287–1288',
    explanation:
      'SGK nêu các mốc Vân Đồn, Vạn Kiếp và Bạch Đằng trong cuộc kháng chiến năm 1287–1288. SGK cũng đưa ra nhận định chung rằng quân xâm lược thường gặp bất lợi vì không thông thạo địa hình và không chủ động được nguồn lương thực; nhận định này không được SGK nêu riêng cho cuộc kháng chiến năm 1287–1288.',
    observePoints: [
      'Quan sát vị trí tương đối của Vân Đồn, Cửa Lục và Bạch Đằng trên mô hình.',
      'So sánh khu vực cửa sông, ven biển và vùng nội địa quanh các địa điểm liên quan.',
      'Đối chiếu khoảng cách tương đối giữa Thăng Long và các địa điểm ở Quảng Ninh.',
    ],
    sourceRef:
      'SGK Lịch sử 11 – Kết nối tri thức với cuộc sống – Bài 7, tr. 46 và tr. 49',
    scopeNote:
      'Dữ liệu bản đồ của đề tài hiện chưa có tọa độ Vạn Kiếp.',
  },
];

const insightsBySlug = new Map(
  TERRAIN_INSIGHTS.map((insight) => [insight.canonicalSlug, insight]),
);

export function getTerrainInsightBySlug(slug: string | null | undefined): TerrainInsight | null {
  if (typeof slug !== 'string') return null;
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return null;
  return insightsBySlug.get(normalizedSlug) ?? null;
}

export function terrainCtaLabel(insight: TerrainInsight | null): string {
  if (insight?.ctaLabel) return insight.ctaLabel;
  if (insight?.relevance === 'decisive') {
    return 'Vì sao địa hình quan trọng với sự kiện này?';
  }
  if (insight?.relevance === 'contextual') {
    return 'Xem bối cảnh địa hình 3D';
  }
  return 'Khám phá địa hình khu vực';
}
