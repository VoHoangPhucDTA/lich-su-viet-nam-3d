import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS, type EventType } from '../../types/event';
import { MAP_CLUSTER_BADGE_BACKGROUND } from '../../utils/mapClusterBadge';

const EVENT_TYPES: EventType[] = ['military', 'political', 'economic', 'cultural'];

export default function MapLegend() {
  return (
    <section className="map-legend" aria-labelledby="map-legend-title">
      <h2 id="map-legend-title">Chú giải bản đồ</h2>
      <div className="map-legend__content">
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
