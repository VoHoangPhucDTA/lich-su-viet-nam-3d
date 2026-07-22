import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
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
  HorizontalOrigin,
  Math as CesiumMath,
  Cartesian2,
  GeoJsonDataSource,
  CustomDataSource,
  ColorMaterialProperty,
  EllipsoidTerrainProvider,
  DistanceDisplayCondition,
  LabelStyle,
  TerrainProvider,
  BoundingSphere,
  HeadingPitchRange,
  ArcType,
  Matrix4,
  PolygonHierarchy,
  PropertyBag,
  ConstantProperty,
  sampleTerrainMostDetailed,
} from 'cesium';
import type { TerrainInspectionResult } from '../utils/terrainInspection';
import type {
  DistanceMeasurementPhase,
  TerrainDistanceMeasurementState,
  TerrainMeasurementPoint,
} from '../utils/terrainMeasurement';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {
  VIETNAM_CENTER,
  configureCesiumIonToken,
  getCesiumIonToken,
  getMarkerColor,
  getTerrainProvider,
} from '../lib/cesium';
import type { HistoricalEvent } from '../types/event';
import type {
  TerrainExplorationMode,
  TerrainRuntimeError,
  TerrainSessionCommand,
} from '../types/terrain';
import type { TerrainRegionTarget } from '../utils/terrainTargets';
import type { RegionGeometryIndex, ResolvedRegionGeometry } from '../utils/regionGeometry';
import { parseRegionGeoJSON, resolveRegionGeometry } from '../utils/regionGeometry';
import {
  createCameraSnapshot,
  isSnapshotForSession,
  terrainFlightDuration,
  type CameraSnapshot,
} from '../utils/cameraSnapshot';

// ─── SAFE MODE ────────────────────────────────────────────────────────────────
// Set to false when globe is confirmed stable to re-enable markers + polygon.
const CESIUM_SAFE_MODE = false;
const TERRAIN_REGION_FILL = Color.fromCssColorString('#c49a45').withAlpha(0.24);
const TERRAIN_REGION_SELECTED_FILL = Color.fromCssColorString('#8b1e1e').withAlpha(0.46);
const TERRAIN_REGION_OUTLINE = Color.fromCssColorString('#6f4e22').withAlpha(0.9);
const TERRAIN_REGION_SELECTED_OUTLINE = Color.WHITE.withAlpha(0.98);
const TERRAIN_POINT_HEIGHT = 45000;
const TERRAIN_OVERVIEW_MIN_RANGE = 80000;
const TERRAIN_OVERVIEW_MAX_RANGE = 1600000;

function polygonHierarchy(polygon: ResolvedRegionGeometry['polygons'][number]) {
  const positions = polygon[0].map((point) => Cartesian3.fromDegrees(point.lng, point.lat));
  const holes = polygon.slice(1).map((ring) => new PolygonHierarchy(
    ring.map((point) => Cartesian3.fromDegrees(point.lng, point.lat)),
  ));
  return new PolygonHierarchy(positions, holes);
}

function regionCartesianPoints(geometry: ResolvedRegionGeometry) {
  return geometry.polygons.flatMap((polygon) =>
    (polygon[0] ?? []).map((point) => Cartesian3.fromDegrees(point.lng, point.lat)),
  );
}

/** Result payload pushed back to the host after a terrain inspection attempt. */
export interface TerrainInspectionPayload {
  result: TerrainInspectionResult | null;
  loading: boolean;
  error: string | null;
}

export interface TerrainMeasurementPayload {
  sessionId: number;
  point: TerrainMeasurementPoint | null;
  error: string | null;
}

/**
 * Imperative handle exposed by CesiumMap. The host (MapPage) uses a
 * pre-allocated ref to call these without ever receiving a Cesium Viewer,
 * Scene, Camera, Entity, DataSource, or ScreenSpaceEventHandler.
 */
export interface CesiumMapHandle {
  /**
   * Move the camera by a fractional amount of its current height.
   * Positive factor = zoom in, negative = zoom out. No-op when the terrain
   * session is not active.
   */
  zoomByFactor(factor: number): void;
  /** Remove the inspection marker and invalidate any pending sample. */
  clearInspectionMarker(): void;
  /** Remove all distance entities and invalidate any pending height sample. */
  clearDistanceMeasurement(): void;
}

interface CesiumMapProps {
  events: HistoricalEvent[];
  selectedEvent: HistoricalEvent | null;
  onSelectEvent: (event: HistoricalEvent | null) => void;
  highlightedEventId: string | null;
  terrainSession: TerrainSessionCommand | null;
  onTerrainReady: (sessionId: number) => void;
  onTerrainProviderReady: (sessionId: number) => void;
  onTerrainGeometryReady: (sessionId: number) => void;
  onTerrainEnterError: (sessionId: number, error: TerrainRuntimeError) => void;
  onTerrainExitComplete: (sessionId: number) => void;
  onTerrainTargetSelect: (sessionId: number, targetId: string) => void;
  onRegionGeometryStatus: (status: 'loading' | 'ready' | 'error', error?: TerrainRuntimeError) => void;
  explorationMode?: TerrainExplorationMode;
  inspectionSessionId?: number;
  onInspectionResultChange?: (payload: TerrainInspectionPayload) => void;
  measurementSessionId?: number;
  measurementPhase?: DistanceMeasurementPhase;
  measurementState?: TerrainDistanceMeasurementState;
  onMeasurementPointChange?: (payload: TerrainMeasurementPayload) => void;
  /**
   * Mutable ref published by CesiumMap so the host can drive imperative
   * actions (zoom, inspection cleanup) without owning Cesium objects.
   */
  apiRef?: MutableRefObject<CesiumMapHandle | null>;
}

export default function CesiumMap({
  events,
  selectedEvent,
  onSelectEvent,
  highlightedEventId,
  terrainSession,
  onTerrainReady,
  onTerrainProviderReady,
  onTerrainGeometryReady,
  onTerrainEnterError,
  onTerrainExitComplete,
  onTerrainTargetSelect,
  onRegionGeometryStatus,
  explorationMode = 'none',
  inspectionSessionId = 0,
  onInspectionResultChange,
  measurementSessionId = 0,
  measurementPhase = 'idle',
  measurementState,
  onMeasurementPointChange,
  apiRef,
}: CesiumMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const entitiesMapRef = useRef<Map<string, Entity>>(new Map());
  const eventEntityDataRef = useRef<WeakMap<Entity, HistoricalEvent>>(new WeakMap());
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const dataSourceRef = useRef<GeoJsonDataSource | null>(null);
  const markerDataSourceRef = useRef<CustomDataSource | null>(null);
  const terrainRegionDataSourceRef = useRef<CustomDataSource | null>(null);
  const regionGeometryIndexRef = useRef<RegionGeometryIndex | null>(null);
  const regionGeometryPromiseRef = useRef<Promise<RegionGeometryIndex> | null>(null);
  const regionGeometryResourcePromiseRef = useRef<Promise<{ raw: unknown; index: RegionGeometryIndex }> | null>(null);
  const regionGeometryOperationRef = useRef(0);
  const terrainRegionEntitiesRef = useRef<Map<string, Entity[]>>(new Map());
  const resolvedTerrainRegionsRef = useRef<Map<string, ResolvedRegionGeometry>>(new Map());
  const lastTerrainCameraRequestRef = useRef<{ sessionId: number; requestId: number } | null>(null);
  const baseTerrainProviderRef = useRef<EllipsoidTerrainProvider | null>(null);
  const terrainProviderRef = useRef<TerrainProvider | null>(null);
  const terrainProviderPromiseRef = useRef<Promise<TerrainProvider> | null>(null);
  const terrainProviderOperationRef = useRef(0);
  const cameraOperationRef = useRef(0);
  const cameraSnapshotRef = useRef<CameraSnapshot | null>(null);
  const mountedRef = useRef(false);
  const viewerLifecycleRef = useRef(0);
  const terrainSessionRef = useRef(terrainSession);
  const skipNextSelectedEventFlyRef = useRef(false);
  const renderErrorRemoverRef = useRef<(() => void) | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  // ─── Inspection-related refs (Task C) ──────────────────────────────────────
  const inspectDataSourceRef = useRef<CustomDataSource | null>(null);
  const internalInspectOpRef = useRef(0);
  const measurementDataSourceRef = useRef<CustomDataSource | null>(null);
  const internalMeasurementOpRef = useRef(0);
  const onInspectionResultChangeRef = useRef(onInspectionResultChange);
  onInspectionResultChangeRef.current = onInspectionResultChange;
  const explorationModePropRef = useRef(explorationMode);
  explorationModePropRef.current = explorationMode;
  const measurementPhaseRef = useRef(measurementPhase);
  measurementPhaseRef.current = measurementPhase;
  const measurementSessionIdRef = useRef(measurementSessionId);
  measurementSessionIdRef.current = measurementSessionId;
  const onMeasurementPointChangeRef = useRef(onMeasurementPointChange);
  onMeasurementPointChangeRef.current = onMeasurementPointChange;

  // Stable ref to callback — avoids re-running init effect when callback changes
  const onSelectEventRef = useRef(onSelectEvent);
  onSelectEventRef.current = onSelectEvent;
  const onTerrainReadyRef = useRef(onTerrainReady);
  const onTerrainProviderReadyRef = useRef(onTerrainProviderReady);
  const onTerrainGeometryReadyRef = useRef(onTerrainGeometryReady);
  const onTerrainEnterErrorRef = useRef(onTerrainEnterError);
  const onTerrainExitCompleteRef = useRef(onTerrainExitComplete);
  const onTerrainTargetSelectRef = useRef(onTerrainTargetSelect);
  const onRegionGeometryStatusRef = useRef(onRegionGeometryStatus);
  onTerrainReadyRef.current = onTerrainReady;
  onTerrainProviderReadyRef.current = onTerrainProviderReady;
  onTerrainGeometryReadyRef.current = onTerrainGeometryReady;
  onTerrainEnterErrorRef.current = onTerrainEnterError;
  onTerrainExitCompleteRef.current = onTerrainExitComplete;
  onTerrainTargetSelectRef.current = onTerrainTargetSelect;
  onRegionGeometryStatusRef.current = onRegionGeometryStatus;
  terrainSessionRef.current = terrainSession;

  // ─── Initialize Cesium Viewer (once, synchronous path) ─────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const viewerLifecycle = viewerLifecycleRef;
    const terrainProviderOperation = terrainProviderOperationRef;
    const regionGeometryOperation = regionGeometryOperationRef;
    const cameraOperation = cameraOperationRef;
    const internalInspectOp = internalInspectOpRef;
    const internalMeasurementOp = internalMeasurementOpRef;
    const terrainRegionEntities = terrainRegionEntitiesRef;
    mountedRef.current = true;
    const lifecycleId = ++viewerLifecycleRef.current;

    // Safety: verify container has real dimensions before init
    // Use rAF so the DOM has been painted and layout is final.
    const rafId = requestAnimationFrame(() => {
      if (!mountedRef.current || viewerLifecycleRef.current !== lifecycleId || !containerRef.current) return;

      const w = container.clientWidth;
      const h = container.clientHeight;
      console.log(`[CesiumMap] container size: ${w}x${h}`);

      if (w === 0 || h === 0) {
        console.error('[CesiumMap] Container has zero size — cannot init Viewer. Check layout.');
        setMapError('Không thể tải bản đồ: container có kích thước 0.');
        return;
      }

      try {
        const ionToken = getCesiumIonToken();
        if (ionToken) configureCesiumIonToken(ionToken);
        const baseTerrainProvider = new EllipsoidTerrainProvider();
        baseTerrainProviderRef.current = baseTerrainProvider;
        // ── Synchronous Viewer creation (no async = no StrictMode race) ──
        const viewer = new Viewer(container, {
          terrainProvider: baseTerrainProvider,
          // Missing Ion credentials must not prevent the globe from initializing.
          baseLayer: ionToken ? undefined : false,
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
        renderErrorRemoverRef.current = viewer.scene.renderError.addEventListener((_scene: unknown, error: unknown) => {
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
              // D1 click priority: measure, inspect, target/event picking.
              if (
                explorationModePropRef.current === 'measure-distance'
                && terrainSessionRef.current?.mode === 'active'
              ) {
                void runDistanceMeasurementAt(movement.position);
                return;
              }
              if (
                explorationModePropRef.current === 'inspect-location'
                && terrainSessionRef.current?.mode === 'active'
              ) {
                void runInspectionAt(movement.position);
                return;
              }
              try {
                const picked = v.scene.pick(movement.position);
                const pickedEntity = defined(picked) && picked.id instanceof Entity
                  ? picked.id
                  : null;
                const currentTerrain = terrainSessionRef.current;
                const pickedSessionId = pickedEntity?.properties?.terrainSessionId?.getValue();
                const pickedTargetId = pickedEntity?.properties?.terrainTargetId?.getValue();
                if (
                  currentTerrain?.mode === 'active'
                  && pickedSessionId === currentTerrain.id
                  && typeof pickedTargetId === 'string'
                ) {
                  onTerrainTargetSelectRef.current(currentTerrain.id, pickedTargetId);
                  return;
                }
                if (currentTerrain) return;
                const pickedEvent = pickedEntity
                  ? eventEntityDataRef.current.get(pickedEntity)
                  : undefined;
                if (pickedEvent) {
                  // Clicked an individual event marker
                  onSelectEventRef.current(pickedEvent);
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
        setViewerReady(true);

        // ── Load and parse province GeoJSON once for this Viewer lifecycle ──
        if (!CESIUM_SAFE_MODE) {
          const geometryOperation = ++regionGeometryOperationRef.current;
          onRegionGeometryStatusRef.current('loading');
          const resourcePromise = fetch('/geojson/vietnam-provinces.json')
            .then((response) => {
              if (!response.ok) throw new Error(`GeoJSON HTTP ${response.status}`);
              return response.json() as Promise<unknown>;
            })
            .then((raw) => {
              const index = parseRegionGeoJSON(raw);
              if (index.features.length === 0) throw new Error('Invalid or empty province GeoJSON');
              return { raw, index };
            });
          regionGeometryResourcePromiseRef.current = resourcePromise;
          regionGeometryPromiseRef.current = resourcePromise.then(({ index }) => index);
          resourcePromise
            .then(async ({ raw, index }) => {
              if (
                !mountedRef.current
                || viewerLifecycleRef.current !== lifecycleId
                || regionGeometryOperationRef.current !== geometryOperation
                || viewer.isDestroyed()
              ) return;
              regionGeometryIndexRef.current = index;
              onRegionGeometryStatusRef.current('ready');
              const dataSource = await GeoJsonDataSource.load(raw, {
                stroke: Color.fromCssColorString('#8b7355').withAlpha(0.45),
                fill: Color.TRANSPARENT,
                strokeWidth: 2,
              });
              if (
                !mountedRef.current
                || viewerLifecycleRef.current !== lifecycleId
                || regionGeometryOperationRef.current !== geometryOperation
                || viewer.isDestroyed()
              ) {
                return;
              }
              await viewer.dataSources.add(dataSource);
              if (
                !mountedRef.current ||
                viewerLifecycleRef.current !== lifecycleId ||
                viewer.isDestroyed()
              ) {
                if (!viewer.isDestroyed()) viewer.dataSources.remove(dataSource, true);
                return;
              }
              dataSourceRef.current = dataSource;
              applyPolygonHighlights(selectedEventRef.current);
            })
            .catch((e) => {
              console.warn('[CesiumMap] GeoJSON load failed (non-fatal):', e);
              if (
                mountedRef.current
                && viewerLifecycleRef.current === lifecycleId
                && regionGeometryOperationRef.current === geometryOperation
              ) {
                onRegionGeometryStatusRef.current('error', {
                  code: 'geojson_load_failed',
                  message: 'Chưa tải được dữ liệu khu vực trên bản đồ.',
                });
              }
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
      mountedRef.current = false;
      ++viewerLifecycle.current;
      ++terrainProviderOperation.current;
      ++regionGeometryOperation.current;
      ++cameraOperation.current;
      ++internalInspectOp.current;
      ++internalMeasurementOp.current;
      cancelAnimationFrame(rafId);
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) viewer.camera.cancelFlight();
      if (handlerRef.current && !handlerRef.current.isDestroyed()) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      renderErrorRemoverRef.current?.();
      renderErrorRemoverRef.current = null;
      if (markerDataSourceRef.current && viewer && !viewer.isDestroyed()) {
        viewer.dataSources.remove(markerDataSourceRef.current, true);
        markerDataSourceRef.current = null;
      }
      if (terrainRegionDataSourceRef.current && viewer && !viewer.isDestroyed()) {
        viewer.dataSources.remove(terrainRegionDataSourceRef.current, true);
        terrainRegionDataSourceRef.current = null;
      }
      if (inspectDataSourceRef.current && viewer && !viewer.isDestroyed()) {
        viewer.dataSources.remove(inspectDataSourceRef.current, true);
        inspectDataSourceRef.current = null;
      }
      if (measurementDataSourceRef.current && viewer && !viewer.isDestroyed()) {
        viewer.dataSources.remove(measurementDataSourceRef.current, true);
        measurementDataSourceRef.current = null;
      }
      if (dataSourceRef.current && viewer && !viewer.isDestroyed()) {
        viewer.dataSources.remove(dataSourceRef.current, true);
        dataSourceRef.current = null;
      }
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
      baseTerrainProviderRef.current = null;
      terrainProviderRef.current = null;
      terrainProviderPromiseRef.current = null;
      regionGeometryIndexRef.current = null;
      regionGeometryPromiseRef.current = null;
      regionGeometryResourcePromiseRef.current = null;
      terrainRegionEntities.current.clear();
      cameraSnapshotRef.current = null;
      eventEntityDataRef.current = new WeakMap();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Inspection pipeline (Task C) ────────────────────────────────────────────
  const inspectionSessionIdRef = useRef(inspectionSessionId);
  inspectionSessionIdRef.current = inspectionSessionId;
  const removeInspectionMarker = useCallback((viewerInstance: Viewer) => {
    const ds = inspectDataSourceRef.current;
    if (ds && !viewerInstance.isDestroyed()) {
      viewerInstance.dataSources.remove(ds, true);
    }
    inspectDataSourceRef.current = null;
  }, []);

  const updateInspectionMarker = useCallback(
    (viewerInstance: Viewer, cartesian: Cartesian3) => {
      const ds = inspectDataSourceRef.current
        ?? new CustomDataSource('terrain-inspect-marker');
      if (!inspectDataSourceRef.current) {
        viewerInstance.dataSources.add(ds);
        inspectDataSourceRef.current = ds;
      } else {
        ds.entities.removeAll();
      }
      ds.entities.add({
        id: 'terrain-inspect-marker:current',
        position: cartesian,
        point: {
          pixelSize: 14,
          color: Color.fromCssColorString('#8b1e1e'),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
          heightReference: HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    },
    [],
  );

  const runInspectionAt = useCallback(async (pixel: Cartesian2) => {
    const viewer = viewerRef.current;
    const session = terrainSessionRef.current;
    if (
      !viewer
      || viewer.isDestroyed()
      || !session
      || session.mode !== 'active'
      || explorationModePropRef.current !== 'inspect-location'
    ) {
      return;
    }
    const currentInspectSessionId = inspectionSessionIdRef.current;
    const opId = ++internalInspectOpRef.current;
    const onResult = onInspectionResultChangeRef.current;
    onResult?.({ result: null, loading: true, error: null });
    try {
      const scene = viewer.scene;
      const depthTest = scene.globe.depthTestAgainstTerrain === true;
      const pickSupported = scene.pickPositionSupported === true;
      const cartesian = depthTest && pickSupported
        ? scene.pickPosition(pixel)
        : scene.camera.pickEllipsoid(pixel, scene.globe.ellipsoid);
      if (
        !viewerRef.current
        || viewer.isDestroyed()
        || opId !== internalInspectOpRef.current
        || currentInspectSessionId !== inspectionSessionIdRef.current
      ) {
        return;
      }
      if (!cartesian) {
        removeInspectionMarker(viewer);
        onResult?.({
          result: null,
          loading: false,
          error: 'Không thể xác định vị trí trên bản đồ.',
        });
        return;
      }
      let status: 'available' | 'ellipsoid_only' = 'available';
      let heightValue: number | null = 0;
      const carto = Cartographic.fromCartesian(cartesian);
      const provider = viewer.terrainProvider;
      const providerIsEllipsoid = !provider
        || provider instanceof EllipsoidTerrainProvider
        || !depthTest;
      if (providerIsEllipsoid) {
        status = 'ellipsoid_only';
        heightValue = carto.height;
      } else {
        try {
          const sampled = await sampleTerrainMostDetailed(provider, [
            Cartographic.fromRadians(carto.longitude, carto.latitude),
          ]);
          if (
            !viewerRef.current
            || viewer.isDestroyed()
            || opId !== internalInspectOpRef.current
            || currentInspectSessionId !== inspectionSessionIdRef.current
          ) {
            return;
          }
          const sampledCarto = sampled[0];
          if (sampledCarto && Number.isFinite(sampledCarto.height)) {
            heightValue = sampledCarto.height;
            status = 'available';
          } else {
            status = 'ellipsoid_only';
            heightValue = carto.height;
          }
        } catch {
          if (
            !viewerRef.current
            || viewer.isDestroyed()
            || opId !== internalInspectOpRef.current
            || currentInspectSessionId !== inspectionSessionIdRef.current
          ) {
            return;
          }
          onResult?.({
            result: null,
            loading: false,
            error: 'Không thể tải độ cao địa hình tại vị trí này.',
          });
          return;
        }
      }
      updateInspectionMarker(
        viewer,
        status === 'available' && Number.isFinite(heightValue)
          ? Cartesian3.fromRadians(carto.longitude, carto.latitude, heightValue as number)
          : cartesian,
      );
      onResult?.({
        result: {
          latitude: carto.latitude,
          longitude: carto.longitude,
          heightMeters: heightValue,
          heightStatus: status,
        },
        loading: false,
        error: null,
      });
    } finally {
      // opId + inspectionSessionId together enforce latest-wins.
    }
  }, [removeInspectionMarker, updateInspectionMarker]);

  // ─── Distance measurement pipeline (Task D1) ────────────────────────────────
  const removeDistanceMeasurement = useCallback((viewerInstance: Viewer) => {
    const ds = measurementDataSourceRef.current;
    if (ds && !viewerInstance.isDestroyed()) {
      viewerInstance.dataSources.remove(ds, true);
    }
    measurementDataSourceRef.current = null;
  }, []);

  const runDistanceMeasurementAt = useCallback(async (pixel: Cartesian2) => {
    const viewer = viewerRef.current;
    const terrainSession = terrainSessionRef.current;
    if (
      !viewer
      || viewer.isDestroyed()
      || terrainSession?.mode !== 'active'
      || explorationModePropRef.current !== 'measure-distance'
      || (measurementPhaseRef.current !== 'waiting-for-start'
        && measurementPhaseRef.current !== 'waiting-for-end')
    ) return;

    const terrainSessionId = terrainSession.id;
    const currentMeasurementSessionId = measurementSessionIdRef.current;
    const opId = ++internalMeasurementOpRef.current;
    const onPoint = onMeasurementPointChangeRef.current;
    const isStale = () => (
      !viewerRef.current
      || viewer.isDestroyed()
      || opId !== internalMeasurementOpRef.current
      || currentMeasurementSessionId !== measurementSessionIdRef.current
      || explorationModePropRef.current !== 'measure-distance'
      || terrainSessionRef.current?.mode !== 'active'
      || terrainSessionRef.current.id !== terrainSessionId
    );

    const scene = viewer.scene;
    const depthTest = scene.globe.depthTestAgainstTerrain === true;
    const cartesian = depthTest && scene.pickPositionSupported === true
      ? scene.pickPosition(pixel) ?? scene.camera.pickEllipsoid(pixel, scene.globe.ellipsoid)
      : scene.camera.pickEllipsoid(pixel, scene.globe.ellipsoid);
    if (isStale()) return;
    if (!cartesian) {
      onPoint?.({
        sessionId: currentMeasurementSessionId,
        point: null,
        error: 'Không thể xác định điểm trên bề mặt bản đồ.',
      });
      return;
    }

    const cartographic = Cartographic.fromCartesian(cartesian);
    const provider = viewer.terrainProvider;
    const providerIsEllipsoid = !provider
      || provider instanceof EllipsoidTerrainProvider
      || !depthTest;
    let terrainHeightMeters: number | null = null;

    if (!providerIsEllipsoid) {
      try {
        const sampled = await sampleTerrainMostDetailed(provider, [
          Cartographic.fromRadians(cartographic.longitude, cartographic.latitude),
        ]);
        if (isStale()) return;
        const height = sampled[0]?.height;
        terrainHeightMeters = Number.isFinite(height) ? height : null;
      } catch {
        if (isStale()) return;
        terrainHeightMeters = null;
      }
    }

    if (isStale()) return;
    onPoint?.({
      sessionId: currentMeasurementSessionId,
      point: {
        latitude: CesiumMath.toDegrees(cartographic.latitude),
        longitude: CesiumMath.toDegrees(cartographic.longitude),
        terrainHeightMeters,
      },
      error: null,
    });
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    if (explorationMode !== 'measure-distance' || !measurementState?.start) {
      removeDistanceMeasurement(viewer);
      return;
    }

    const ds = measurementDataSourceRef.current
      ?? new CustomDataSource('terrain-distance-measurement');
    if (!measurementDataSourceRef.current) {
      viewer.dataSources.add(ds);
      measurementDataSourceRef.current = ds;
    } else {
      ds.entities.removeAll();
    }

    const addPoint = (label: 'A' | 'B', point: TerrainMeasurementPoint) => {
      ds.entities.add({
        id: `terrain-distance-measurement:${label}`,
        position: Cartesian3.fromDegrees(
          point.longitude,
          point.latitude,
          point.terrainHeightMeters ?? 0,
        ),
        point: {
          pixelSize: 13,
          color: label === 'A'
            ? Color.fromCssColorString('#1d4ed8')
            : Color.fromCssColorString('#b91c1c'),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
          heightReference: HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: label,
          font: '700 14px sans-serif',
          style: LabelStyle.FILL_AND_OUTLINE,
          fillColor: Color.WHITE,
          outlineColor: Color.fromCssColorString('#1c1917'),
          outlineWidth: 3,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -16),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    };

    addPoint('A', measurementState.start);
    if (measurementState.end) {
      addPoint('B', measurementState.end);
      ds.entities.add({
        id: 'terrain-distance-measurement:line',
        polyline: {
          positions: [
            Cartesian3.fromDegrees(
              measurementState.start.longitude,
              measurementState.start.latitude,
            ),
            Cartesian3.fromDegrees(
              measurementState.end.longitude,
              measurementState.end.latitude,
            ),
          ],
          width: 4,
          material: Color.fromCssColorString('#fbbf24').withAlpha(0.9),
          clampToGround: true,
          arcType: ArcType.GEODESIC,
        },
      });
    }
  }, [
    explorationMode,
    measurementState?.end,
    measurementState?.start,
    removeDistanceMeasurement,
  ]);

  // ─── App API Handle (Task C) ──────────────────────────────────────────────────
  useEffect(() => {
    if (!apiRef) return;
    if (!viewerReady) {
      apiRef.current = null;
      return undefined;
    }
    const handle: CesiumMapHandle = {
      zoomByFactor(factor) {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed()) return;
        if (terrainSessionRef.current?.mode !== 'active') return;
        if (!Number.isFinite(factor) || factor === 0) return;
        ++cameraOperationRef.current; // invalidate any in-flight terrain flyTo callbacks
        viewer.camera.cancelFlight();
        const height = Number.isFinite(viewer.camera.positionCartographic.height)
          ? viewer.camera.positionCartographic.height
          : 200000;
        const amount = Math.max(50, Math.abs(height * Math.abs(factor)));
        if (factor > 0) viewer.camera.zoomIn(amount);
        else viewer.camera.zoomOut(amount);
      },
      clearInspectionMarker() {
        const viewer = viewerRef.current;
        if (viewer && !viewer.isDestroyed()) removeInspectionMarker(viewer);
        ++internalInspectOpRef.current; // drop any in-flight sample
        onInspectionResultChangeRef.current?.({
          result: null,
          loading: false,
          error: null,
        });
      },
      clearDistanceMeasurement() {
        const viewer = viewerRef.current;
        if (viewer && !viewer.isDestroyed()) removeDistanceMeasurement(viewer);
        ++internalMeasurementOpRef.current;
      },
    };
    apiRef.current = handle;
    return () => {
      if (apiRef.current === handle) apiRef.current = null;
    };
  }, [apiRef, removeDistanceMeasurement, removeInspectionMarker, viewerReady]);

  // Clear inspection marker when inspect mode flips off, or when the
  // terrain session exits "active".
  useEffect(() => {
    if (explorationMode !== 'inspect-location') {
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) removeInspectionMarker(viewer);
      ++internalInspectOpRef.current;
    }
  }, [explorationMode, removeInspectionMarker]);

  useEffect(() => {
    if (explorationMode === 'measure-distance') return;
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) removeDistanceMeasurement(viewer);
    ++internalMeasurementOpRef.current;
  }, [explorationMode, removeDistanceMeasurement]);

  useEffect(() => {
    if (terrainSession?.mode === 'active') return;
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) removeInspectionMarker(viewer);
    if (viewer && !viewer.isDestroyed()) removeDistanceMeasurement(viewer);
    ++internalInspectOpRef.current;
    ++internalMeasurementOpRef.current;
  }, [removeDistanceMeasurement, removeInspectionMarker, terrainSession]);

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
        cluster.label.horizontalOrigin = HorizontalOrigin.CENTER;
        cluster.billboard.show = false;
      });

      entitiesMapRef.current.clear();
      eventEntityDataRef.current = new WeakMap();

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
              pixelOffset: new Cartesian2(0, -22),
              heightReference: HeightReference.CLAMP_TO_GROUND,
              distanceDisplayCondition: new DistanceDisplayCondition(0, 2000000),
              showBackground: true,
              backgroundColor: Color.fromCssColorString('rgba(28, 25, 23, 0.9)'),
              backgroundPadding: new Cartesian2(10, 6),
            },
          });

          eventEntityDataRef.current.set(entity, event);
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
    if (!viewerReady) return;
    renderMarkers(events);
  }, [events, renderMarkers, viewerReady]);

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
          entity.polygon.outlineColor = new ConstantProperty(baseColor.withAlpha(0.95));
          entity.polygon.outlineWidth = new ConstantProperty(2);
        } else if (secondarySet.has(normalizedName)) {
          entity.polygon.material = secondaryMaterial;
          entity.polygon.outlineColor = new ConstantProperty(baseColor.withAlpha(0.65));
          entity.polygon.outlineWidth = new ConstantProperty(1.5);
        } else {
          entity.polygon.material = defaultMaterial;
          entity.polygon.outlineColor = new ConstantProperty(
            Color.fromCssColorString('#8b7355').withAlpha(0.45),
          );
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

  const clearTerrainRegions = useCallback((viewer: Viewer) => {
    const dataSource = terrainRegionDataSourceRef.current;
    if (dataSource && !viewer.isDestroyed()) viewer.dataSources.remove(dataSource, true);
    terrainRegionDataSourceRef.current = null;
    terrainRegionEntitiesRef.current.clear();
    resolvedTerrainRegionsRef.current.clear();
  }, []);

  const styleTerrainRegions = useCallback((selectedTargetId: string | null) => {
    for (const [targetId, entities] of terrainRegionEntitiesRef.current) {
      const selected = targetId === selectedTargetId;
      for (const entity of entities) {
        if (!entity.polygon) continue;
        entity.polygon.material = new ColorMaterialProperty(
          selected ? TERRAIN_REGION_SELECTED_FILL : TERRAIN_REGION_FILL,
        );
        entity.polygon.outlineColor = new ConstantProperty(selected
          ? TERRAIN_REGION_SELECTED_OUTLINE
          : TERRAIN_REGION_OUTLINE);
        entity.polygon.outlineWidth = new ConstantProperty(selected ? 4 : 2);
      }
    }
  }, []);

  const flyTerrainView = useCallback((
    viewer: Viewer,
    session: TerrainSessionCommand,
    complete?: () => void,
    cancel?: () => void,
  ) => {
    const target = session.overview || !session.selectedTargetId
      ? null
      : session.targets.find((item) => item.id === session.selectedTargetId) ?? null;
    const points: Cartesian3[] = [];
    if (target?.kind === 'point') {
      points.push(Cartesian3.fromDegrees(target.position.lng, target.position.lat));
    } else if (target?.kind === 'region') {
      const geometry = resolvedTerrainRegionsRef.current.get(target.id);
      if (geometry) points.push(...regionCartesianPoints(geometry));
    } else {
      for (const item of session.targets) {
        if (item.kind === 'point') {
          points.push(Cartesian3.fromDegrees(item.position.lng, item.position.lat));
        } else {
          const geometry = resolvedTerrainRegionsRef.current.get(item.id);
          if (geometry) points.push(...regionCartesianPoints(geometry));
        }
      }
    }
    if (points.length === 0) throw new Error('No resolved terrain camera targets');

    const reducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const duration = terrainFlightDuration(reducedMotion);
    if (target?.kind === 'point') {
      const destination = Cartesian3.fromDegrees(
        target.position.lng,
        target.position.lat,
        TERRAIN_POINT_HEIGHT,
      );
      if (duration === 0) {
        viewer.camera.setView({
          destination,
          orientation: { heading: 0, pitch: CesiumMath.toRadians(-35), roll: 0 },
        });
        complete?.();
      } else {
        viewer.camera.flyTo({
          destination,
          orientation: { heading: 0, pitch: CesiumMath.toRadians(-35), roll: 0 },
          duration,
          complete,
          cancel,
        });
      }
      return;
    }

    const sphere = BoundingSphere.fromPoints(points);
    const range = Math.min(
      Math.max(sphere.radius * 2.8, TERRAIN_OVERVIEW_MIN_RANGE),
      TERRAIN_OVERVIEW_MAX_RANGE,
    );
    const offset = new HeadingPitchRange(0, CesiumMath.toRadians(-50), range);
    viewer.camera.flyToBoundingSphere(sphere, {
      offset,
      duration,
      complete,
      cancel,
    });
  }, []);

  useEffect(() => {
    if (!mapError || terrainSession?.mode !== 'entering') return;
    onTerrainEnterErrorRef.current(terrainSession.id, {
      code: 'viewer_unavailable',
      message: 'Bản đồ 3D hiện không khả dụng. Vui lòng thử lại sau.',
    });
  }, [mapError, terrainSession]);

  // ─── Terrain provider + camera session lifecycle ────────────────────────────
  useEffect(() => {
    const session = terrainSession;
    if (!session || !viewerReady) return;
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const isCurrentSession = () => {
      const current = terrainSessionRef.current;
      return mountedRef.current
        && !viewer.isDestroyed()
        && current?.id === session.id;
    };
    const prefersReducedMotion = () =>
      typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const resetBaseTerrain = () => {
      const base = baseTerrainProviderRef.current;
      if (!viewer.isDestroyed() && base) viewer.terrainProvider = base;
      if (!viewer.isDestroyed()) {
        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.depthTestAgainstTerrain = false;
      }
    };
    const reportError = (error: TerrainRuntimeError) => {
      if (!isCurrentSession()) return;
      resetBaseTerrain();
      clearTerrainRegions(viewer);
      onTerrainEnterErrorRef.current(session.id, error);
    };

    if (session.mode === 'exiting') {
      ++terrainProviderOperationRef.current;
      const cameraOperation = ++cameraOperationRef.current;
      viewer.camera.cancelFlight();
      clearTerrainRegions(viewer);
      lastTerrainCameraRequestRef.current = null;
      const snapshot = cameraSnapshotRef.current;
      const finalizeExit = () => {
        if (
          cameraOperationRef.current !== cameraOperation
          || !isCurrentSession()
        ) return;
        resetBaseTerrain();
        cameraSnapshotRef.current = null;
        skipNextSelectedEventFlyRef.current = true;
        onTerrainExitCompleteRef.current(session.id);
      };
      if (!snapshot || snapshot.sessionId !== session.id) {
        finalizeExit();
        return;
      }
      const applySnapshot = () => {
        if (viewer.isDestroyed()) return;
        viewer.camera.lookAtTransform(Matrix4.IDENTITY);
        viewer.camera.setView({
          destination: Cartesian3.fromElements(...snapshot.positionWC),
          orientation: {
            direction: Cartesian3.fromElements(...snapshot.directionWC),
            up: Cartesian3.fromElements(...snapshot.upWC),
          },
        });
      };
      const duration = terrainFlightDuration(prefersReducedMotion(), 1.1);
      if (duration === 0) {
        applySnapshot();
        finalizeExit();
        return;
      }
      try {
        viewer.camera.lookAtTransform(Matrix4.IDENTITY);
        viewer.camera.flyTo({
          destination: Cartesian3.fromElements(...snapshot.positionWC),
          orientation: {
            direction: Cartesian3.fromElements(...snapshot.directionWC),
            up: Cartesian3.fromElements(...snapshot.upWC),
          },
          duration,
          complete: finalizeExit,
          cancel: () => {
            if (cameraOperationRef.current !== cameraOperation || !isCurrentSession()) return;
            applySnapshot();
            finalizeExit();
          },
        });
      } catch {
        applySnapshot();
        finalizeExit();
      }
      return;
    }

    if (session.mode === 'active') {
      styleTerrainRegions(session.overview ? null : session.selectedTargetId);
      const lastRequest = lastTerrainCameraRequestRef.current;
      if (
        lastRequest?.sessionId === session.id
        && lastRequest.requestId === session.cameraRequestId
      ) return;
      lastTerrainCameraRequestRef.current = {
        sessionId: session.id,
        requestId: session.cameraRequestId,
      };
      ++cameraOperationRef.current;
      viewer.camera.cancelFlight();
      try {
        flyTerrainView(viewer, session);
      } catch (error) {
        console.warn('[CesiumMap] terrain target camera failed:', error);
      }
      return;
    }

    if (session.mode !== 'entering') return;
    const regionTargets = session.targets.filter(
      (target): target is TerrainRegionTarget => target.kind === 'region',
    );

    const providerOperation = ++terrainProviderOperationRef.current;
    const enteringViewer = viewer;
    const enteringSession = session;
    const enteringSessionId = session.id;
    async function enterTerrain() {
      const token = getCesiumIonToken();
      if (!token) {
        reportError({
          code: 'missing_token',
          message: 'Chưa cấu hình quyền truy cập địa hình 3D.',
        });
        return;
      }

      try {
        let provider = terrainProviderRef.current;
        if (!provider) {
          let providerPromise = terrainProviderPromiseRef.current;
          if (!providerPromise) {
            providerPromise = getTerrainProvider(token);
            terrainProviderPromiseRef.current = providerPromise;
          }
          try {
            provider = await providerPromise;
          } finally {
            if (terrainProviderPromiseRef.current === providerPromise) {
              terrainProviderPromiseRef.current = null;
            }
          }
          if (!mountedRef.current || enteringViewer.isDestroyed()) return;
          terrainProviderRef.current = provider;
        }
        if (
          terrainProviderOperationRef.current !== providerOperation
          || !isCurrentSession()
          || terrainSessionRef.current?.mode !== 'entering'
        ) return;

        enteringViewer.terrainProvider = provider;
        enteringViewer.scene.globe.enableLighting = true;
        enteringViewer.scene.globe.depthTestAgainstTerrain = true;
        onTerrainProviderReadyRef.current(enteringSessionId);

        if (regionTargets.length > 0) {
          let index = regionGeometryIndexRef.current;
          if (!index) {
            try {
              index = await regionGeometryPromiseRef.current;
            } catch {
              onRegionGeometryStatusRef.current('loading');
              try {
                const retryPromise = fetch('/geojson/vietnam-provinces.json')
                  .then((response) => {
                    if (!response.ok) throw new Error(`GeoJSON HTTP ${response.status}`);
                    return response.json() as Promise<unknown>;
                  })
                  .then((raw) => {
                    const parsed = parseRegionGeoJSON(raw);
                    if (parsed.features.length === 0) throw new Error('Invalid or empty province GeoJSON');
                    return parsed;
                  });
                regionGeometryPromiseRef.current = retryPromise;
                index = await retryPromise;
                if (!isCurrentSession()) return;
                regionGeometryIndexRef.current = index;
                onRegionGeometryStatusRef.current('ready');
              } catch {
                onRegionGeometryStatusRef.current('error', {
                  code: 'geojson_load_failed',
                  message: 'Chưa tải được dữ liệu khu vực trên bản đồ.',
                });
                reportError({
                  code: 'geojson_load_failed',
                  message: 'Chưa tải được dữ liệu khu vực trên bản đồ.',
                });
                return;
              }
            }
          }
          if (!index || !isCurrentSession()) return;
          const resolved = regionTargets.flatMap((target) => {
            const geometry = resolveRegionGeometry(index, target.gadmRef, target.label);
            if (geometry) return [{ target, geometry }];
            console.warn('[CesiumMap] terrain region unresolved', {
              sessionId: enteringSessionId,
              eventId: enteringSession.eventId,
              gadmRef: target.gadmRef,
              code: 'region_not_found',
            });
            return [];
          });
          const hasPointTarget = enteringSession.targets.some((target) => target.kind === 'point');
          if (resolved.length === 0 && !hasPointTarget) {
            reportError({
              code: 'region_not_found',
              message: 'Chưa xác định được khu vực liên quan trên bản đồ.',
            });
            return;
          }

          clearTerrainRegions(enteringViewer);
          if (resolved.length > 0) {
            const dataSource = new CustomDataSource(`terrain-region-session-${enteringSessionId}`);
            for (const item of resolved) {
              resolvedTerrainRegionsRef.current.set(item.target.id, item.geometry);
              const entities = item.geometry.polygons.map((polygon, polygonIndex) => dataSource.entities.add({
                id: `${item.target.id}:part:${polygonIndex}`,
                name: item.target.label,
                properties: new PropertyBag({
                  terrainSessionId: enteringSessionId,
                  terrainTargetId: item.target.id,
                  terrainTargetKind: 'region',
                  gadmRef: item.target.gadmRef,
                }),
                polygon: {
                  hierarchy: polygonHierarchy(polygon),
                  material: TERRAIN_REGION_FILL,
                  outline: true,
                  outlineColor: TERRAIN_REGION_OUTLINE,
                  outlineWidth: 2,
                  heightReference: HeightReference.CLAMP_TO_GROUND,
                },
              }));
              terrainRegionEntitiesRef.current.set(item.target.id, entities);
            }
            await enteringViewer.dataSources.add(dataSource);
            if (!isCurrentSession() || terrainProviderOperationRef.current !== providerOperation) {
              if (!enteringViewer.isDestroyed()) enteringViewer.dataSources.remove(dataSource, true);
              return;
            }
            terrainRegionDataSourceRef.current = dataSource;
          }
        }
        onTerrainGeometryReadyRef.current(enteringSessionId);
        if (!isSnapshotForSession(cameraSnapshotRef.current, enteringSessionId)) {
          cameraSnapshotRef.current = createCameraSnapshot(enteringSessionId, enteringViewer.camera);
        }

        const cameraOperation = ++cameraOperationRef.current;
        enteringViewer.camera.cancelFlight();
        const isCurrentFlight = () =>
          cameraOperationRef.current === cameraOperation
          && isCurrentSession()
          && terrainSessionRef.current?.mode === 'entering';
        const complete = () => {
          if (isCurrentFlight()) onTerrainReadyRef.current(enteringSessionId);
        };
        const cancel = () => {
          if (!isCurrentFlight()) return;
          reportError({
            code: 'camera_failed',
            message: 'Chuyển góc nhìn địa hình đã bị hủy.',
          });
        };
        lastTerrainCameraRequestRef.current = {
          sessionId: enteringSessionId,
          requestId: enteringSession.cameraRequestId,
        };
        styleTerrainRegions(null);
        try {
          flyTerrainView(enteringViewer, enteringSession, complete, cancel);
        } catch {
          reportError({
            code: 'camera_failed',
            message: 'Không thể thiết lập góc nhìn địa hình cho sự kiện này.',
          });
        }
      } catch {
        if (terrainProviderOperationRef.current !== providerOperation) return;
        terrainProviderRef.current = null;
        reportError({
          code: 'provider_load_failed',
          message: 'Không tải được địa hình 3D. Bản đồ cơ bản vẫn có thể sử dụng.',
        });
      }
    }

    void enterTerrain();
  }, [
    clearTerrainRegions,
    flyTerrainView,
    styleTerrainRegions,
    terrainSession,
    viewerReady,
  ]);

  // ─── Fly to selected event ───────────────────────────────────────────────────
  useEffect(() => {
    // 1.1.19: CesiumMap.tsx: Lắng nghe selectedEvent thay đổi, sử dụng thư viện CesiumJS để hiển thị vùng đánh dấu (polygon, điểm) và tự động bay camera (flyTo) đến tọa độ vùng ảnh hưởng của sự kiện.
    if (CESIUM_SAFE_MODE || terrainSession || cameraSnapshotRef.current) return;
    if (skipNextSelectedEventFlyRef.current) {
      skipNextSelectedEventFlyRef.current = false;
      return;
    }

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
  }, [selectedEvent, computeRegionBounds, terrainSession]);

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
