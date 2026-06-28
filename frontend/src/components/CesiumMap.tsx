import { useEffect, useRef, useCallback, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Viewer,
  Entity,
  Cartesian3,
  Cartographic,
  Color,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  HeightReference,
  VerticalOrigin,
  Math as CesiumMath,
  Cartesian2,
  GeoJsonDataSource,
  CustomDataSource,
  ColorMaterialProperty,
  EllipsoidTerrainProvider,
  DistanceDisplayCondition,
  LabelStyle,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { VIETNAM_CENTER, getMarkerColor } from '../lib/cesium';
import type { HistoricalEvent } from '../types/event';

// ─── SAFE MODE ────────────────────────────────────────────────────────────────
// Set to false when globe is confirmed stable to re-enable markers + polygon.
const CESIUM_SAFE_MODE = false;

// ─── Module-level guard ────────────────────────────────────────────────────────
// A React useRef resets on every mount (including StrictMode double-mount).
// A module-level variable persists across StrictMode mount/unmount/re-mount cycles,
// preventing two Viewers from being created on the same container.
let viewerInstance: Viewer | null = null;
let viewerContainerEl: HTMLDivElement | null = null;

interface CesiumMapProps {
  events: HistoricalEvent[];
  selectedEvent: HistoricalEvent | null;
  onSelectEvent: (event: HistoricalEvent | null) => void;
  highlightedEventId: string | null;
}

export default function CesiumMap({
  events,
  selectedEvent,
  onSelectEvent,
  highlightedEventId,
}: CesiumMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const entitiesMapRef = useRef<Map<string, Entity>>(new Map());
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const dataSourceRef = useRef<GeoJsonDataSource | null>(null);
  const markerDataSourceRef = useRef<CustomDataSource | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  // Stable ref to callback — avoids re-running init effect when callback changes
  const onSelectEventRef = useRef(onSelectEvent);
  onSelectEventRef.current = onSelectEvent;

  // ─── Initialize Cesium Viewer (once, synchronous path) ─────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Guard: if we already have a live viewer attached to THIS container, skip.
    if (viewerInstance && !viewerInstance.isDestroyed() && viewerContainerEl === container) {
      viewerRef.current = viewerInstance;
      return;
    }

    // Guard: destroy stale viewer from a previous container (HMR / navigate away)
    if (viewerInstance && !viewerInstance.isDestroyed()) {
      viewerInstance.destroy();
      viewerInstance = null;
      viewerContainerEl = null;
    }

    // Safety: verify container has real dimensions before init
    // Use rAF so the DOM has been painted and layout is final.
    let rafId: number;
    rafId = requestAnimationFrame(() => {
      if (!container || !containerRef.current) return;

      const w = container.clientWidth;
      const h = container.clientHeight;
      console.log(`[CesiumMap] container size: ${w}x${h}`);

      if (w === 0 || h === 0) {
        console.error('[CesiumMap] Container has zero size — cannot init Viewer. Check layout.');
        setMapError('Không thể tải bản đồ: container có kích thước 0.');
        return;
      }

      try {
        // ── Synchronous Viewer creation (no async = no StrictMode race) ──
        const viewer = new Viewer(container, {
          // SAFE MODE: always use EllipsoidTerrainProvider (no network, no token needed)
          terrainProvider: new EllipsoidTerrainProvider(),
          animation: false,
          timeline: false,
          fullscreenButton: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          baseLayerPicker: false,
          navigationHelpButton: false,
          infoBox: false,
          selectionIndicator: false,
          shadows: false,
          shouldAnimate: false,
        });

        // ── Suppress Cesium's built-in error overlay (replaces [object Object] alert) ──
        viewer.scene.renderError.addEventListener((_scene: unknown, error: unknown) => {
          const msg =
            error instanceof Error
              ? `${error.message}\n${error.stack ?? ''}`
              : typeof error === 'object'
                ? JSON.stringify(error)
                : String(error);
          console.error('[CesiumMap] renderError:', msg);
          // Show a soft UI error once — do NOT call viewer.destroy() here
          setMapError('Lỗi render Cesium. Xem console để biết chi tiết.');
        });

        // ── Initial camera (instant, no animation during init) ──
        viewer.camera.setView({ destination: VIETNAM_CENTER });

        // ── Globe settings ──
        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.depthTestAgainstTerrain = false;

        // ── Click handler ──
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
        if (!CESIUM_SAFE_MODE) {
          handler.setInputAction(
            (movement: { position: Cartesian2 }) => {
              const v = viewerRef.current;
              if (!v || v.isDestroyed()) return;
              try {
                const picked = v.scene.pick(movement.position);
                if (defined(picked) && picked.id && (picked.id as any).eventData) {
                  // Clicked an individual event marker
                  onSelectEventRef.current((picked.id as any).eventData as HistoricalEvent);
                } else if (!defined(picked) || !picked.id) {
                  // Clicked empty space — deselect
                  onSelectEventRef.current(null);
                }
                // If clicked a cluster (picked.id exists but no eventData), do nothing —
                // user needs to zoom in to see individual markers
              } catch (e) {
                console.warn('[CesiumMap] Pick error:', e);
              }
            },
            ScreenSpaceEventType.LEFT_CLICK
          );
        }

        handlerRef.current = handler;
        viewerRef.current = viewer;
        viewerInstance = viewer;
        viewerContainerEl = container;

        // ── Load GeoJSON (non-blocking, optional) ──
        if (!CESIUM_SAFE_MODE) {
          GeoJsonDataSource.load('/geojson/vietnam-provinces.json', {
            stroke: Color.fromCssColorString('#8b7355').withAlpha(0.45),
            fill: Color.TRANSPARENT,
            strokeWidth: 2,
          })
            .then((dataSource) => {
              if (viewer && !viewer.isDestroyed()) {
                viewer.dataSources.add(dataSource);
                dataSourceRef.current = dataSource;
                // Re-apply polygon highlights now that GeoJSON is loaded.
                // selectedEvent might have been set before GeoJSON finished loading.
                applyPolygonHighlights(selectedEventRef.current);
              }
            })
            .catch((e) => {
              console.warn('[CesiumMap] GeoJSON load failed (non-fatal):', e);
            });
        }

        console.log('[CesiumMap] Viewer initialized successfully.');
      } catch (err) {
        console.error('[CesiumMap] Failed to create Viewer:', err);
        setMapError(
          'Không thể khởi tạo bản đồ 3D. Vui lòng kiểm tra Cesium token hoặc kết nối mạng.'
        );
      }
    });

    return () => {
      cancelAnimationFrame(rafId);
      // On unmount: clean up handler but KEEP the viewer alive on the module-level variable.
      // This prevents StrictMode from destroying and re-creating the viewer on the 2nd mount.
      // The viewer will only be truly destroyed when the container element changes.
      if (handlerRef.current && !handlerRef.current.isDestroyed()) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      // Do NOT destroy viewerInstance here — that causes the StrictMode double-init crash.
      viewerRef.current = null;
      // Clean up marker datasource on unmount
      if (markerDataSourceRef.current && viewerInstance && !viewerInstance.isDestroyed()) {
        viewerInstance.dataSources.remove(markerDataSourceRef.current, true);
        markerDataSourceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Render markers ──────────────────────────────────────────────────────────
  const renderMarkers = useCallback(
    (eventsToRender: HistoricalEvent[]) => {
      if (CESIUM_SAFE_MODE) return; // skip in safe mode

      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;

      // Remove old datasource if exists
      if (markerDataSourceRef.current) {
        viewer.dataSources.remove(markerDataSourceRef.current, true);
      }

      const ds = new CustomDataSource('eventMarkers');
      ds.clustering.enabled = true;
      ds.clustering.pixelRange = 55;
      ds.clustering.minimumClusterSize = 2;

      // Cluster styling: show count badge instead of default pin
      ds.clustering.clusterEvent.addEventListener((_clusteredEntities, cluster) => {
        if (!defined(cluster.label) || !defined(cluster.billboard)) return;
        cluster.label.show = true;
        cluster.label.fillColor = Color.WHITE;
        cluster.label.font = 'bold 12px Inter, sans-serif';
        cluster.label.style = LabelStyle.FILL_AND_OUTLINE;
        cluster.label.outlineColor = Color.fromCssColorString('#C49A45');
        cluster.label.backgroundColor = Color.fromCssColorString('rgba(18, 16, 14, 0.85)');
        cluster.label.outlineWidth = 2;
        cluster.label.verticalOrigin = VerticalOrigin.CENTER;
        cluster.label.horizontalOrigin = 0 as any; // HorizontalOrigin.CENTER
        cluster.billboard.show = false;
      });

      entitiesMapRef.current.clear();

      eventsToRender.forEach((event) => {
        // Guard: skip no-location events
        if (!event.coordinates || event.geoType === 'no_location') return;

        // Guard: coordinates must be finite numbers
        const { lat, lng } = event.coordinates;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          console.warn(
            `[CesiumMap] Skipping "${event.id}" — invalid coords:`,
            event.coordinates
          );
          return;
        }

        const color = getMarkerColor(event.eventType);
        const isHighlighted = highlightedEventId === event.id;
        const pixelSize = isHighlighted ? 18 : 14;

        try {
          const entity = ds.entities.add({
            name: event.name,
            position: Cartesian3.fromDegrees(lng, lat),
            point: {
              pixelSize,
              color,
              outlineColor: Color.WHITE,
              outlineWidth: 2,
              heightReference: HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: event.name,
              font: 'bold 14px Inter, sans-serif',
              fillColor: Color.WHITE,
              outlineColor: Color.fromCssColorString('#8b1e1e'),
              outlineWidth: 3,
              style: LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: VerticalOrigin.BOTTOM,
              pixelOffset: new Cartesian3(0, -22, 0) as any,
              heightReference: HeightReference.CLAMP_TO_GROUND,
              distanceDisplayCondition: new DistanceDisplayCondition(0, 2000000),
              showBackground: true,
              backgroundColor: Color.fromCssColorString('rgba(28, 25, 23, 0.9)'),
              backgroundPadding: new Cartesian3(10, 6, 0) as any,
            },
          });

          (entity as any).eventData = event;
          entitiesMapRef.current.set(event.id, entity);
        } catch (e) {
          console.warn(`[CesiumMap] Failed to add entity for "${event.id}":`, e);
        }
      });

      viewer.dataSources.add(ds);
      markerDataSourceRef.current = ds;
    },
    [highlightedEventId]
  );

  useEffect(() => {
    renderMarkers(events);
  }, [events, renderMarkers]);

  // ─── Selected event ref (for reapply when GeoJSON loads async) ─────────────
  const selectedEventRef = useRef(selectedEvent);
  selectedEventRef.current = selectedEvent;

  // ─── Update polygon highlights ───────────────────────────────────────────────
  // Only highlight provinces for multi_region events. single_point events show
  // only the marker; nationwide/no_location show no province highlights.
  // Empty deps [] is intentional: all captured values are stable imports/refs.
  const applyPolygonHighlights = useCallback(
    (event: HistoricalEvent | null) => {
      const dataSource = dataSourceRef.current;
      if (!dataSource) return;

      const normalizeString = (str: string) => str.replace(/\s+/g, '').toLowerCase();
      const safeStringArray = (value: unknown): string[] =>
        Array.isArray(value)
          ? value.filter((item): item is string => typeof item === 'string')
          : [];

      // Only highlight provinces for multi_region events
      const shouldHighlight =
        event &&
        event.geoType === 'multi_region' &&
        event.primaryRegions &&
        event.primaryRegions.length > 0;

      const primarySet = shouldHighlight
        ? new Set(safeStringArray(event!.primaryRegions).map(normalizeString))
        : new Set<string>();
      const secondarySet = shouldHighlight
        ? new Set(safeStringArray(event!.secondaryRegions).map(normalizeString))
        : new Set<string>();

      const baseColor =
        event && shouldHighlight
          ? getMarkerColor(event.eventType)
          : Color.fromCssColorString('#4f6f95');

      const primaryMaterial = new ColorMaterialProperty(baseColor.withAlpha(0.5));
      const secondaryMaterial = new ColorMaterialProperty(baseColor.withAlpha(0.22));
      const defaultMaterial = new ColorMaterialProperty(Color.TRANSPARENT);

      const entities = dataSource.entities.values;
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        if (!entity.polygon) continue;
        const name = entity.properties?.NAME_1?.getValue() || '';
        const normalizedName = normalizeString(name);
        if (primarySet.has(normalizedName)) {
          entity.polygon.material = primaryMaterial;
          entity.polygon.outlineColor = baseColor.withAlpha(0.95) as any;
          entity.polygon.outlineWidth = 2 as any;
        } else if (secondarySet.has(normalizedName)) {
          entity.polygon.material = secondaryMaterial;
          entity.polygon.outlineColor = baseColor.withAlpha(0.65) as any;
          entity.polygon.outlineWidth = 1.5 as any;
        } else {
          entity.polygon.material = defaultMaterial;
          entity.polygon.outlineColor = Color.fromCssColorString('#8b7355').withAlpha(0.45) as any;
        }
      }
    },
    []
  );

  useEffect(() => {
    if (CESIUM_SAFE_MODE) return;
    applyPolygonHighlights(selectedEvent);
  }, [selectedEvent, applyPolygonHighlights]);

  // ─── Helper: compute bounding rectangle for a multi-region event ────────────
  const computeRegionBounds = useCallback(
    (provinceNames: string[]): Rectangle | null => {
      const dataSource = dataSourceRef.current;
      if (!dataSource) return null;

      const normalizeString = (str: string) => str.replace(/\s+/g, '').toLowerCase();
      const nameSet = new Set(provinceNames.map(normalizeString));

      const allCartographics: Cartographic[] = [];

      const entities = dataSource.entities.values;
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        if (!entity.polygon) continue;
        const name = entity.properties?.NAME_1?.getValue() || '';
        if (!nameSet.has(normalizeString(name))) continue;

        const hierarchy = entity.polygon.hierarchy?.getValue();
        if (!hierarchy?.positions) continue;

        for (let j = 0; j < hierarchy.positions.length; j++) {
          allCartographics.push(Cartographic.fromCartesian(hierarchy.positions[j]));
        }
      }

      if (allCartographics.length === 0) return null;

      return Rectangle.fromCartographicArray(allCartographics);
    },
    []
  );

  // ─── Fly to selected event ───────────────────────────────────────────────────
  useEffect(() => {
    // 1.1.19: CesiumMap.tsx: Lắng nghe selectedEvent thay đổi, sử dụng thư viện CesiumJS để hiển thị vùng đánh dấu (polygon, điểm) và tự động bay camera (flyTo) đến tọa độ vùng ảnh hưởng của sự kiện.
    if (CESIUM_SAFE_MODE) return;

    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !selectedEvent) return;

    const hasChildren =
      !!selectedEvent.children && selectedEvent.children.length > 0;

    // multi_region: compute bounding box from GeoJSON province polygons
    if (
      selectedEvent.geoType === 'multi_region' &&
      selectedEvent.primaryRegions &&
      selectedEvent.primaryRegions.length > 1
    ) {
      const bounds = computeRegionBounds(selectedEvent.primaryRegions);
      if (bounds) {
        try {
          viewer.camera.flyTo({
            destination: bounds,
            orientation: {
              heading: CesiumMath.toRadians(0),
              pitch: CesiumMath.toRadians(-90),
              roll: 0,
            },
            duration: 1.5,
          });
        } catch (e) {
          console.warn('[CesiumMap] flyTo (region bounds) error:', e);
        }
        return;
      }
    }

    // Có coordinates (kể cả centroid fallback) → flyTo trực tiếp
    if (selectedEvent.coordinates && selectedEvent.geoType !== 'no_location') {
      const { lat, lng } = selectedEvent.coordinates;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      // Altitude theo geoType:
      //  - single_point + có children     → 800km (xem cụm sự kiện con)
      //  - single_point (marker chính xác) → 30km  (zoom sát, thấy rõ marker)
      //  - multi_region (fallback)         → 500km
      //  - nationwide                      → 1500km (toàn quốc)
      let altitude = 30000;
      if (hasChildren) altitude = 800000;
      else if (selectedEvent.geoType === 'multi_region') altitude = 500000;
      else if (selectedEvent.geoType === 'nationwide') altitude = 1500000;

      try {
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(lng, lat, altitude),
          orientation: {
            heading: CesiumMath.toRadians(0),
            pitch: CesiumMath.toRadians(-90),
            roll: 0,
          },
          duration: 1.5,
        });
      } catch (e) {
        console.warn('[CesiumMap] flyTo error:', e);
      }
      return;
    }

    // Không có vị trí cụ thể (no_location hoặc thiếu coordinates) → bay về toàn
    // cảnh Việt Nam để user thấy phản hồi visual khi chọn event
    try {
      viewer.camera.flyTo({
        destination: VIETNAM_CENTER,
        orientation: {
          heading: CesiumMath.toRadians(0),
          pitch: CesiumMath.toRadians(-90),
          roll: 0,
        },
        duration: 1.5,
      });
    } catch (e) {
      console.warn('[CesiumMap] flyTo (default view) error:', e);
    }
  }, [selectedEvent, computeRegionBounds]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        ref={containerRef}
        id="cesium-container"
        style={{ width: '100%', height: '100%' }}
      />
      {/* Soft error fallback — replaced the [object Object] alert */}
      {mapError && (
        <div
          className="absolute left-1/2 bottom-4 -translate-x-1/2 flex items-center gap-2 rounded-lg border px-4 py-2 text-xs pointer-events-none z-10"
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            borderColor: 'rgba(239, 68, 68, 0.4)',
            color: '#e8b0b7',
          }}
        >
          <AlertTriangle size={14} strokeWidth={2.2} />
          {mapError}
        </div>
      )}
    </div>
  );
}
