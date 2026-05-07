import { useEffect, useRef, useCallback, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Viewer,
  Entity,
  Cartesian3,
  Color,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  HeightReference,
  VerticalOrigin,
  Math as CesiumMath,
  Cartesian2,
  GeoJsonDataSource,
  ColorMaterialProperty,
  EllipsoidTerrainProvider,
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
                  onSelectEventRef.current((picked.id as any).eventData as HistoricalEvent);
                } else {
                  onSelectEventRef.current(null);
                }
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
            stroke: Color.WHITE.withAlpha(0.2),
            fill: Color.TRANSPARENT,
            strokeWidth: 1,
          })
            .then((dataSource) => {
              if (viewer && !viewer.isDestroyed()) {
                viewer.dataSources.add(dataSource);
                dataSourceRef.current = dataSource;
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Render markers ──────────────────────────────────────────────────────────
  const renderMarkers = useCallback(
    (eventsToRender: HistoricalEvent[]) => {
      if (CESIUM_SAFE_MODE) return; // skip in safe mode

      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;

      viewer.entities.removeAll();
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
          const entity = viewer.entities.add({
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
              font: '13px Inter, sans-serif',
              fillColor: Color.WHITE,
              outlineColor: Color.BLACK,
              outlineWidth: 3,
              style: 2, // FILL_AND_OUTLINE
              verticalOrigin: VerticalOrigin.BOTTOM,
              pixelOffset: new Cartesian3(0, -22, 0) as any,
              heightReference: HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              showBackground: true,
              backgroundColor: Color.fromCssColorString('rgba(15, 23, 42, 0.8)'),
              backgroundPadding: new Cartesian3(8, 5, 0) as any,
            },
          });

          (entity as any).eventData = event;
          entitiesMapRef.current.set(event.id, entity);
        } catch (e) {
          console.warn(`[CesiumMap] Failed to add entity for "${event.id}":`, e);
        }
      });
    },
    [highlightedEventId]
  );

  useEffect(() => {
    renderMarkers(events);
  }, [events, renderMarkers]);

  // ─── Update polygon highlights ───────────────────────────────────────────────
  useEffect(() => {
    if (CESIUM_SAFE_MODE) return;

    const dataSource = dataSourceRef.current;
    if (!dataSource) return;

    const normalizeString = (str: string) => str.replace(/\s+/g, '').toLowerCase();
    const safeStringArray = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];

    const primarySet = new Set(
      safeStringArray(selectedEvent?.primaryRegions).map(normalizeString)
    );
    const secondarySet = new Set(
      safeStringArray(selectedEvent?.secondaryRegions).map(normalizeString)
    );

    let baseColor = Color.fromCssColorString('#4f6f95');
    if (selectedEvent) {
      baseColor = getMarkerColor(selectedEvent.eventType);
    }

    const primaryMaterial = new ColorMaterialProperty(baseColor.withAlpha(0.35));
    const secondaryMaterial = new ColorMaterialProperty(baseColor.withAlpha(0.15));
    const defaultMaterial = new ColorMaterialProperty(Color.TRANSPARENT);

    const entities = dataSource.entities.values;
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (!entity.polygon) continue;
      const name = entity.properties?.NAME_1?.getValue() || '';
      const normalizedName = normalizeString(name);
      if (primarySet.has(normalizedName)) {
        entity.polygon.material = primaryMaterial;
        entity.polygon.outlineColor = baseColor.withAlpha(0.8) as any;
      } else if (secondarySet.has(normalizedName)) {
        entity.polygon.material = secondaryMaterial;
        entity.polygon.outlineColor = baseColor.withAlpha(0.5) as any;
      } else {
        entity.polygon.material = defaultMaterial;
        entity.polygon.outlineColor = Color.WHITE.withAlpha(0.2) as any;
      }
    }
  }, [selectedEvent]);

  // ─── Fly to selected event ───────────────────────────────────────────────────
  useEffect(() => {
    if (CESIUM_SAFE_MODE) return;

    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !selectedEvent) return;

    const hasChildren =
      !!selectedEvent.children && selectedEvent.children.length > 0;

    // Có coordinates (kể cả centroid fallback) → flyTo trực tiếp
    if (selectedEvent.coordinates && selectedEvent.geoType !== 'no_location') {
      const { lat, lng } = selectedEvent.coordinates;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      // Altitude theo geoType:
      //  - single_point + có children     → 800km (xem cụm sự kiện con)
      //  - single_point (marker chính xác) → 200km (zoom gần)
      //  - multi_region (fallback centroid hoặc nhiều vùng) → 500km
      //  - nationwide                      → 1500km (toàn quốc)
      let altitude = 200000;
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
  }, [selectedEvent]);

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
