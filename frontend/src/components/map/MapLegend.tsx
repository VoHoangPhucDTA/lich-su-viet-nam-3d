import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS, type EventType } from '../../types/event';
import { MAP_CLUSTER_BADGE_BACKGROUND } from '../../utils/mapClusterBadge';

const EVENT_TYPES: EventType[] = ['military', 'political', 'economic', 'cultural'];

export default function MapLegend() {
  return (
    <section className="map-legend" aria-labelledby="map-legend-title">
      <h2 id="map-legend-title">Chú giải bản đồ</h2>
      <div className="map-legend__content">
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
        <div className="map-legend__roles">
          <div className="map-legend__item">
            <span aria-hidden="true" className="map-legend__marker map-legend__marker--collection" />
            <span>Marker vòng: nhóm sự kiện</span>
          </div>
          <div className="map-legend__item">
            <span aria-hidden="true" className="map-legend__marker map-legend__marker--atomic map-legend__marker--sample" />
            <span>Marker đặc: sự kiện cụ thể</span>
          </div>
          <div className="map-legend__item">
            <span
              aria-hidden="true"
              className="map-legend__cluster"
              style={{ backgroundColor: MAP_CLUSTER_BADGE_BACKGROUND }}
            >3</span>
            <span>Badge có số: cụm điểm trên bản đồ</span>
          </div>
        </div>
      </div>
    </section>
  );
}
