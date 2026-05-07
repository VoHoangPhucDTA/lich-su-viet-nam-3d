import {
  Ion,
  Cartesian3,
  Color,
  VerticalOrigin,
  HorizontalOrigin,
  NearFarScalar,
  HeightReference,
  createWorldTerrainAsync,
} from 'cesium';

// Set your Cesium Ion access token here
// Get a free token at: https://ion.cesium.com/
Ion.defaultAccessToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhMjU4ZWNhMC00MTgyLTRiMjEtODNmYi0wNTY2NTU3YzNiMTAiLCJpZCI6NDAyMzAwLCJpYXQiOjE3NzMyOTczMzN9.op6w5yyz8-45g92FFq9J6XLX-Dmlt-V1RgZj2KwN5Kk';

// Default camera position (centered on Vietnam)
export const VIETNAM_CENTER = Cartesian3.fromDegrees(108.0, 16.0, 2000000);
export const HANOI_POSITION = Cartesian3.fromDegrees(105.8542, 21.0285, 50000);

// Terrain provider
export const getTerrainProvider = () => createWorldTerrainAsync();

// Marker styling helpers
export const getMarkerColor = (eventType: string): Color => {
  switch (eventType) {
    case 'military':
      return Color.fromCssColorString('#9f1d2d');
    case 'political':
      return Color.fromCssColorString('#2f5d8a');
    case 'economic':
      return Color.fromCssColorString('#c29b4b');
    case 'cultural':
      return Color.fromCssColorString('#2f7a57');
    default:
      return Color.WHITE;
  }
};

export const getMarkerGlowColor = (eventType: string): Color => {
  switch (eventType) {
    case 'military':
      return Color.fromCssColorString('#9f1d2d').withAlpha(0.3);
    case 'political':
      return Color.fromCssColorString('#2f5d8a').withAlpha(0.3);
    case 'economic':
      return Color.fromCssColorString('#c29b4b').withAlpha(0.3);
    case 'cultural':
      return Color.fromCssColorString('#2f7a57').withAlpha(0.3);
    default:
      return Color.WHITE.withAlpha(0.3);
  }
};

// Common entity options
export const MARKER_SCALE = new NearFarScalar(1.5e2, 1.0, 1.5e7, 0.3);
export const MARKER_VERTICAL_ORIGIN = VerticalOrigin.BOTTOM;
export const MARKER_HORIZONTAL_ORIGIN = HorizontalOrigin.CENTER;
export const MARKER_HEIGHT_REFERENCE = HeightReference.CLAMP_TO_GROUND;

// Polygon styling
export const POLYGON_PRIMARY_ALPHA = 0.35;
export const POLYGON_SECONDARY_ALPHA = 0.15;
export const POLYGON_OUTLINE_ALPHA = 0.8;
