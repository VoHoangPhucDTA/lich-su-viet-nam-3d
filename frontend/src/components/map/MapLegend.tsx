import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS, type EventType } from '../../types/event';
import {
  ADMINISTRATIVE_BOUNDARY_LAYERS,
  DEFAULT_ADMINISTRATIVE_BOUNDARY_LAYER_ID,
  type AdministrativeBoundaryLayerId,
} from '../../utils/administrativeBoundaryLayers';
import { MAP_CLUSTER_BADGE_BACKGROUND } from '../../utils/mapClusterBadge';

const EVENT_TYPES: EventType[] = ['military', 'political', 'economic', 'cultural'];

interface MapLegendProps {
  selectedBoundaryLayerId?: AdministrativeBoundaryLayerId;
  onBoundaryLayerChange?: (layerId: AdministrativeBoundaryLayerId) => void;
  boundaryLayerError?: string | null;
}

export default function MapLegend({
  selectedBoundaryLayerId = DEFAULT_ADMINISTRATIVE_BOUNDARY_LAYER_ID,
  onBoundaryLayerChange,
  boundaryLayerError = null,
}: MapLegendProps) {
  return (
    <section className="map-legend" aria-labelledby="map-legend-title">
      <h2 id="map-legend-title">Chú giải bản đồ</h2>
      <div className="map-legend__content">
        <div className="map-legend__section map-legend__boundary">
          <h3>Lớp ranh giới tham chiếu</h3>
          <label className="map-legend__boundary-label" htmlFor="map-boundary-layer">
            Chọn lớp hiển thị
          </label>
          <select
            id="map-boundary-layer"
            className="map-legend__boundary-select"
            aria-label="Lớp ranh giới hành chính tham chiếu"
            value={selectedBoundaryLayerId}
            onChange={(event) => onBoundaryLayerChange?.(event.target.value as AdministrativeBoundaryLayerId)}
          >
            {ADMINISTRATIVE_BOUNDARY_LAYERS.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {layer.label}
              </option>
            ))}
          </select>
          <p className="map-legend__disclaimer">
            Ranh giới hành chính là lớp dữ liệu tham chiếu theo bộ dữ liệu được chọn, dùng để hỗ trợ định vị.
            Ranh giới này không được hiểu là ranh giới hành chính lịch sử tại thời điểm xảy ra sự kiện.
          </p>
          <p className="map-legend__disclaimer">
            “Việt Nam 2026 — 34 tỉnh/thành” là ví dụ minh họa khả năng mở rộng nhiều lớp ranh giới theo thời kỳ;
            đây không phải phục dựng ranh giới lịch sử.
          </p>
          {boundaryLayerError && (
            <p className="map-legend__boundary-error" role="alert">
              Không thể tải lớp ranh giới đang chọn. Lớp GADM và dữ liệu sự kiện vẫn được giữ nguyên.
            </p>
          )}
        </div>
        <div className="map-legend__section">
          <h3>Màu sắc sự kiện</h3>
          <div className="map-legend__categories">
          {EVENT_TYPES.map((type) => (
            <div className="map-legend__item" key={type}>
              <span
                aria-hidden="true"
                className="map-legend__marker map-legend__marker--atomic"
                style={{ backgroundColor: EVENT_TYPE_COLORS[type] }}
              />
              <span>{EVENT_TYPE_LABELS[type]}</span>
            </div>
          ))}
          </div>
        </div>
        <div className="map-legend__section map-legend__roles">
          <h3>Ký hiệu trên bản đồ</h3>
          <div className="map-legend__item">
            <span aria-hidden="true" className="map-legend__marker map-legend__marker--collection" />
            <span>Vòng tròn rỗng: Sự kiện có các sự kiện con</span>
          </div>
          <div className="map-legend__item">
            <span aria-hidden="true" className="map-legend__marker map-legend__marker--atomic map-legend__marker--sample" />
            <span>Chấm tròn: Sự kiện cụ thể</span>
          </div>
          <div className="map-legend__item">
            <span
              aria-hidden="true"
              className="map-legend__cluster"
              style={{ backgroundColor: MAP_CLUSTER_BADGE_BACKGROUND }}
            >3</span>
            <span>
              Cụm có số: Nhiều sự kiện nằm gần nhau
              <small>Nhấn để xem gần hơn</small>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
