import { useEffect, useRef, useCallback } from 'react';
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
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { VIETNAM_CENTER, getMarkerColor } from '../lib/cesium';
import type { HistoricalEvent } from '../types/event';

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

  // Initialize Cesium Viewer
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const viewer = new Viewer(containerRef.current, {
      animation: false,
      timeline: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: true,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      infoBox: false,
      shadows: false,
      shouldAnimate: false,
    });

    // Fly to Vietnam on load
    viewer.camera.flyTo({
      destination: VIETNAM_CENTER,
      duration: 0,
    });

    // Enable terrain
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.depthTestAgainstTerrain = false;

    // Load Vietnam province boundaries
    GeoJsonDataSource.load('/geojson/vietnam-provinces.json', {
      stroke: Color.WHITE.withAlpha(0.2),
      fill: Color.TRANSPARENT,
      strokeWidth: 1,
    }).then((dataSource) => {
      viewer.dataSources.add(dataSource);
      dataSourceRef.current = dataSource;
    });

    viewerRef.current = viewer;

    // Click handler
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(
      (movement: { position: Cartesian2 }) => {
        const picked = viewer.scene.pick(movement.position);
        if (defined(picked) && picked.id && picked.id.eventData) {
          onSelectEvent(picked.id.eventData as HistoricalEvent);
        } else {
          onSelectEvent(null);
        }
      },
      ScreenSpaceEventType.LEFT_CLICK
    );
    handlerRef.current = handler;

    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update the onSelectEvent callback in the handler
  const onSelectEventRef = useRef(onSelectEvent);
  onSelectEventRef.current = onSelectEvent;

  useEffect(() => {
    if (!handlerRef.current || handlerRef.current.isDestroyed()) return;
    handlerRef.current.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
    handlerRef.current.setInputAction(
      (movement: { position: Cartesian2 }) => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        const picked = viewer.scene.pick(movement.position);
        if (defined(picked) && picked.id && picked.id.eventData) {
          onSelectEventRef.current(picked.id.eventData as HistoricalEvent);
        } else {
          onSelectEventRef.current(null);
        }
      },
      ScreenSpaceEventType.LEFT_CLICK
    );
  }, [onSelectEvent]);

  // Render markers for current events
  const renderMarkers = useCallback(
    (eventsToRender: HistoricalEvent[]) => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      // Clear existing entities
      viewer.entities.removeAll();
      entitiesMapRef.current.clear();

      eventsToRender.forEach((event) => {
        if (!event.coordinates || event.geoType === 'no_location') return;

        const color = getMarkerColor(event.eventType);
        const isHighlighted = highlightedEventId === event.id;
        const pixelSize = isHighlighted ? 18 : 14;

        const entity = viewer.entities.add({
          name: event.name,
          position: Cartesian3.fromDegrees(
            event.coordinates.lng,
            event.coordinates.lat
          ),
          point: {
            pixelSize: pixelSize,
            color: color,
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

        // Store event data on entity for click detection
        (entity as any).eventData = event;
        entitiesMapRef.current.set(event.id, entity);
      });
    },
    [highlightedEventId]
  );

  // Update markers when events change
  useEffect(() => {
    renderMarkers(events);
  }, [events, renderMarkers]);

  // Update polygon highlights when selected event changes
  useEffect(() => {
    const dataSource = dataSourceRef.current;
    if (!dataSource) return;

    const normalizeString = (str: string) => str.replace(/\s+/g, '').toLowerCase();

    const primarySet = new Set(
      (selectedEvent?.primaryRegions || []).map(normalizeString)
    );
    const secondarySet = new Set(
      (selectedEvent?.secondaryRegions || []).map(normalizeString)
    );
    
    // Determine target color based on event type if selected, else default
    let baseColor = Color.fromCssColorString('#6366f1'); // Default primary
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

  // Fly to selected event
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !selectedEvent) return;

    if (selectedEvent.coordinates && selectedEvent.geoType !== 'no_location') {
      const hasChildren =
        selectedEvent.children && selectedEvent.children.length > 0;
      const altitude = hasChildren ? 800000 : 200000;

      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          selectedEvent.coordinates.lng,
          selectedEvent.coordinates.lat,
          altitude
        ),
        orientation: {
          heading: CesiumMath.toRadians(0),
          pitch: CesiumMath.toRadians(-90),
          roll: 0,
        },
        duration: 1.5,
      });
    }
  }, [selectedEvent]);

  return (
    <div ref={containerRef} className="w-full h-full" id="cesium-container" />
  );
}
