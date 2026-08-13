import type { TerrainTarget } from '../utils/terrainTargets';

export const DIEN_BIEN_PHU_CANONICAL_SLUG = 'chien-dich-dien-bien-phu-1954';

export type DienBienPhuLearningLocationKey =
  | 'him-lam'
  | 'doi-doc-lap'
  | 'ban-keo'
  | 'muong-thanh';

export type DienBienPhuLearningTargetLabel =
  | 'Him Lam'
  | 'Đồi Độc Lập'
  | 'Bản Kéo'
  | 'Mường Thanh';

export interface HistoricalLearningSource {
  organization: string;
  title: string;
  url: string;
  accessedAt: string;
}

export interface DienBienPhuLearningLocation {
  key: DienBienPhuLearningLocationKey;
  targetLabel: DienBienPhuLearningTargetLabel;
  displayName: string;
  phaseLabel: string;
  locationKind: 'historical_site' | 'representative_area';
  role: string;
  development: string;
  connection: string;
  sources: readonly HistoricalLearningSource[];
}

export interface DienBienPhuLearningTargetProjection {
  applies: boolean;
  complete: boolean;
  targets: TerrainTarget[];
}

export const DIEN_BIEN_PHU_LEARNING_SOURCES = {
  himLam: {
    organization: 'Ban Quản lý Di tích tỉnh Điện Biên',
    title: 'Di tích Trung tâm đề kháng Him Lam',
    url: 'https://bqldt.svhttdl.dienbien.gov.vn/portal/pages/2020-3-11/Di-tich-Trung-tam-de-khang-Him-Lam3szb5866d9tf.aspx',
    accessedAt: '2026-08-13',
  },
  doiDocLap: {
    organization: 'Ban Quản lý Di tích tỉnh Điện Biên',
    title: 'Di tích Đồi Độc Lập (Gabrielle)',
    url: 'https://bqldt.svhttdl.dienbien.gov.vn/portal/pages/2023-11-3/Di-tich-Doi-Doc-Lap-Gabrielle-yxqmjxwg0hpm.aspx',
    accessedAt: '2026-08-13',
  },
  dienBienCampaign: {
    organization: 'Sở Văn hóa, Thể thao và Du lịch tỉnh Điện Biên',
    title: 'Chiến dịch Điện Biên Phủ lịch sử',
    url: 'https://svhttdl.dienbien.gov.vn/ditich/pages/2014/Chien-dich-Dien-Bien-Phu-lich-su-0270.aspx',
    accessedAt: '2026-08-13',
  },
  campaignArtifacts: {
    organization: 'Sở Văn hóa, Thể thao và Du lịch tỉnh Điện Biên',
    title: 'Hiện vật góp phần làm nên chiến thắng Điện Biên Phủ',
    url: 'https://svhttdl.dienbien.gov.vn/portal/pages/2021-7-7/Hien-vat-gop-phan-lam-nen-chien-thang-Dien-Bien-Phmntgge2wburf.aspx',
    accessedAt: '2026-08-13',
  },
  defensiveSystem: {
    organization: 'Sở Văn hóa, Thể thao và Du lịch tỉnh Điện Biên',
    title: 'Hệ thống phòng ngự Tập đoàn cứ điểm quân sự của Pháp tại Điện Biên Phủ',
    url: 'https://svhttdl.dienbien.gov.vn/ditich/pages/2020-6-22/He-thong-phong-ngu-Tap-doan-cu-diem-quan-su-cua-Phhiw9o16zstmr.aspx',
    accessedAt: '2026-08-13',
  },
  muongThanhAirfield: {
    organization: 'Sở Văn hóa, Thể thao và Du lịch tỉnh Điện Biên',
    title: 'Di tích Sân bay Mường Thanh',
    url: 'https://svhttdl.dienbien.gov.vn/ditich/pages/2015/Di-tich-San-bay-Muong-Thanh-6646.aspx',
    accessedAt: '2026-08-13',
  },
} as const satisfies Record<string, HistoricalLearningSource>;

export const DIEN_BIEN_PHU_LEARNING_LOCATIONS: readonly DienBienPhuLearningLocation[] = [
  {
    key: 'him-lam',
    targetLabel: 'Him Lam',
    displayName: 'Him Lam',
    phaseLabel: 'Đợt 1 · 13/3/1954',
    locationKind: 'historical_site',
    role:
      'Him Lam là một trung tâm đề kháng ở cửa ngõ Đông Bắc, có nhiệm vụ bảo vệ từ xa cho khu trung tâm của tập đoàn cứ điểm Điện Biên Phủ.',
    development:
      'Chiều 13/3/1954, quân ta nổ súng tiến công Him Lam, mở màn Chiến dịch Điện Biên Phủ. Đến 23h30 cùng ngày, quân ta hoàn thành tiêu diệt trung tâm đề kháng Him Lam.',
    connection:
      'Thắng lợi tại Him Lam mở đầu quá trình phá vỡ tuyến phòng ngự vòng ngoài. Sau đó quân ta tiếp tục tiến công Đồi Độc Lập; đến ngày 17/3, Bản Kéo bị bức hàng, cửa ngõ phía Bắc của tập đoàn cứ điểm bị phá vỡ.',
    sources: [
      DIEN_BIEN_PHU_LEARNING_SOURCES.himLam,
      DIEN_BIEN_PHU_LEARNING_SOURCES.dienBienCampaign,
    ],
  },
  {
    key: 'doi-doc-lap',
    targetLabel: 'Đồi Độc Lập',
    displayName: 'Đồi Độc Lập',
    phaseLabel: 'Đợt 1 · 15/3/1954',
    locationKind: 'historical_site',
    role:
      'Đồi Độc Lập là trung tâm đề kháng Gabrielle thuộc Phân khu Bắc, giữ một vị trí quan trọng trong hệ thống phòng ngự phía Bắc của tập đoàn cứ điểm.',
    development:
      'Rạng sáng 15/3/1954, quân ta mở cuộc tiến công Đồi Độc Lập. Trận đánh bắt đầu lúc 3h30 và đến khoảng 6h30 cùng ngày, quân ta hoàn toàn làm chủ cứ điểm.',
    connection:
      'Sau khi Him Lam và Đồi Độc Lập lần lượt bị tiêu diệt, Bản Kéo rơi vào thế bị cô lập. Chuỗi thắng lợi này làm hệ thống phòng ngự phía Bắc suy yếu nhanh chóng.',
    sources: [
      DIEN_BIEN_PHU_LEARNING_SOURCES.doiDocLap,
      DIEN_BIEN_PHU_LEARNING_SOURCES.dienBienCampaign,
    ],
  },
  {
    key: 'ban-keo',
    targetLabel: 'Bản Kéo',
    displayName: 'Bản Kéo',
    phaseLabel: 'Đợt 1 · 17/3/1954',
    locationKind: 'historical_site',
    role:
      'Bản Kéo thuộc hệ thống phòng ngự của Phân khu Bắc và là một trong những vị trí còn lại sau khi Him Lam và Đồi Độc Lập bị tiêu diệt.',
    development:
      'Sau thất bại tại Him Lam và Đồi Độc Lập, Bản Kéo rơi vào thế bị cô lập. Ngày 17/3/1954, Bản Kéo bị bức hàng, khép lại đợt tiến công thứ nhất của chiến dịch.',
    connection:
      'Cùng với thắng lợi tại Him Lam và Đồi Độc Lập, việc làm chủ Bản Kéo phá vỡ cửa ngõ phía Bắc của tập đoàn cứ điểm và tạo điều kiện để quân ta tiếp tục xây dựng thế trận vây lấn, siết chặt khu trung tâm.',
    sources: [
      DIEN_BIEN_PHU_LEARNING_SOURCES.campaignArtifacts,
      DIEN_BIEN_PHU_LEARNING_SOURCES.dienBienCampaign,
    ],
  },
  {
    key: 'muong-thanh',
    targetLabel: 'Mường Thanh',
    displayName: 'Khu trung tâm Mường Thanh',
    phaseLabel: 'Trọng điểm · Đợt 2–3',
    locationKind: 'representative_area',
    role:
      'Phân khu Trung tâm nằm giữa thung lũng Mường Thanh và là bộ phận quan trọng nhất của tập đoàn cứ điểm, tập trung sở chỉ huy, trận địa pháo, kho hậu cần, sân bay và hệ thống cứ điểm phòng ngự.',
    development:
      'Sau Đợt 1, quân ta từng bước siết chặt vòng vây quanh khu trung tâm. Trong Đợt 2, các cứ điểm phía Đông và những vị trí bảo vệ sân bay bị tiến công; sân bay Mường Thanh ngày càng bị khống chế và cuối cùng bị vô hiệu hóa, làm khả năng tiếp tế và tăng viện của quân Pháp bị hạn chế nghiêm trọng.',
    connection:
      'Việc phá vỡ các vị trí vòng ngoài tạo điều kiện để quân ta từng bước áp sát khu trung tâm. Qua Đợt 2 và Đợt 3, vòng vây tiếp tục thu hẹp; chiều 7/5, quân ta chiếm Sở chỉ huy tại khu trung tâm và bắt De Castries cùng bộ tham mưu.',
    sources: [
      DIEN_BIEN_PHU_LEARNING_SOURCES.defensiveSystem,
      DIEN_BIEN_PHU_LEARNING_SOURCES.muongThanhAirfield,
      DIEN_BIEN_PHU_LEARNING_SOURCES.dienBienCampaign,
    ],
  },
];

const learningLocationByTargetLabel = new Map<DienBienPhuLearningTargetLabel, DienBienPhuLearningLocation>(
  DIEN_BIEN_PHU_LEARNING_LOCATIONS.map((location) => [location.targetLabel, location]),
);

export function isDienBienPhuCanonicalSlug(
  canonicalSlug: string | undefined,
): boolean {
  return canonicalSlug === DIEN_BIEN_PHU_CANONICAL_SLUG;
}

export function getDienBienPhuLearningLocationByTargetLabel(
  targetLabel: string,
): DienBienPhuLearningLocation | null {
  return learningLocationByTargetLabel.get(targetLabel as DienBienPhuLearningTargetLabel) ?? null;
}

export function dienBienPhuLearningLocationForTarget(
  target: TerrainTarget | null | undefined,
): DienBienPhuLearningLocation | null {
  if (target?.kind !== 'point') return null;
  return getDienBienPhuLearningLocationByTargetLabel(target.label);
}

export function getDienBienPhuLearningLocationForTarget(
  canonicalSlug: string | undefined,
  target: TerrainTarget | null | undefined,
): DienBienPhuLearningLocation | null {
  if (!isDienBienPhuCanonicalSlug(canonicalSlug)) return null;
  return dienBienPhuLearningLocationForTarget(target);
}

/**
 * Projects only the specialized Điện Biên Phủ learning session to its four
 * source-backed semantic targets. Output order follows the learning registry,
 * not runtime array order or `sourceIndex`.
 */
export function projectDienBienPhuLearningSessionTargets(
  canonicalSlug: string | undefined,
  targets: TerrainTarget[],
): DienBienPhuLearningTargetProjection {
  if (!isDienBienPhuCanonicalSlug(canonicalSlug)) {
    return { applies: false, complete: false, targets };
  }

  const targetsByLearningKey = new Map<DienBienPhuLearningLocationKey, TerrainTarget[]>();
  for (const target of targets) {
    const location = dienBienPhuLearningLocationForTarget(target);
    if (!location) continue;
    const matchingTargets = targetsByLearningKey.get(location.key) ?? [];
    matchingTargets.push(target);
    targetsByLearningKey.set(location.key, matchingTargets);
  }

  const projectedTargets = DIEN_BIEN_PHU_LEARNING_LOCATIONS.flatMap(({ key }) => {
    const target = targetsByLearningKey.get(key)?.[0];
    return target ? [target] : [];
  });
  const complete = DIEN_BIEN_PHU_LEARNING_LOCATIONS.every(
    ({ key }) => targetsByLearningKey.get(key)?.length === 1,
  );

  return { applies: true, complete, targets: projectedTargets };
}
