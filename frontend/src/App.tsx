import React, { useState, useEffect, useRef } from 'react';
import { Viewer, Entity, CameraFlyTo } from 'resium';
import {
  Color,
  Cartesian3,
  GeoJsonDataSource,
  ColorMaterialProperty,
  ConstantProperty
} from 'cesium';

import eventsData from './data/events.json';

// --- Tối ưu hóa hàm chuẩn hóa tên ---
// Giúp khớp "Hòa Bình" (JSON) với "HoaBinh" hoặc "HòaBình" (GeoJSON)
const normalizeString = (str: any) => {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Loại bỏ dấu tiếng Việt
    .replace(/\s+/g, "")             // Loại bỏ khoảng trắng
    .toLowerCase();
};

export default function App() {
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [provinceData, setProvinceData] = useState<GeoJsonDataSource | null>(null);
  const viewerRef = useRef<any>(null);

  const PROVINCE_BORDER = Color.WHITE.withAlpha(0.5);
  const COUNTRY_BORDER = Color.YELLOW;

  // 1. LOAD GEOJSON
  useEffect(() => {
    const loadMap = async () => {
      try {
        // Lưu ý: lv1.json thường chứa danh sách Tỉnh, lv2.json chứa danh sách Huyện.
        // Nếu các bạn muốn tô màu Tỉnh, nên dùng lv1.json để performance tốt hơn.
        const province = await GeoJsonDataSource.load('/src/gadm/lv1.json', {
          stroke: PROVINCE_BORDER,
          fill: Color.TRANSPARENT,
          strokeWidth: 1
        });

        const country = await GeoJsonDataSource.load('/src/gadm/lv0.json', {
          stroke: COUNTRY_BORDER,
          fill: Color.TRANSPARENT,
          strokeWidth: 3
        });

        setProvinceData(province);
        if (viewerRef.current?.cesiumElement) {
          viewerRef.current.cesiumElement.dataSources.add(province);
          viewerRef.current.cesiumElement.dataSources.add(country);
        }
      } catch (err) {
        console.error("Load map error", err);
      }
    };
    loadMap();
  }, []);

  // 2. HIGHLIGHT LOGIC (SỬA LỖI MULTI_REGION & SINGLE_POINT)
  useEffect(() => {
    if (!provinceData) return;

    const entities = provinceData.entities.values;
    const mainRegions = (selectedEvent?.region_ids?.main || []).map(normalizeString);
    const subRegions = (selectedEvent?.region_ids?.sub || []).map(normalizeString);

    provinceData.entities.suspendEvents();

    entities.forEach((entity: any) => {
      if (!entity.polygon) return;

      // Lấy tên tỉnh từ GeoJSON (NAME_1 thường là cấp Tỉnh)
      const rawName = entity.properties.NAME_1?.getValue();
      const normalizedGeoName = normalizeString(rawName);

      // RESET mặc định: Chỉ hiện viền trắng mờ, không màu nền
      entity.polygon.material = new ColorMaterialProperty(Color.TRANSPARENT);
      entity.polygon.outlineColor = new ConstantProperty(PROVINCE_BORDER);

      if (selectedEvent) {
        // VẤN ĐỀ 1 & 2: Xử lý theo geo_type
        if (selectedEvent.geo_type === 'multi_region') {
          if (mainRegions.includes(normalizedGeoName)) {
            // Tỉnh chính: Đỏ
            entity.polygon.material = new ColorMaterialProperty(Color.RED.withAlpha(0.6));
            entity.polygon.outlineColor = new ConstantProperty(Color.YELLOW);
          } else if (subRegions.includes(normalizedGeoName)) {
            // Tỉnh phụ (Vấn đề 1): Cam
            entity.polygon.material = new ColorMaterialProperty(Color.ORANGE.withAlpha(0.5));
            entity.polygon.outlineColor = new ConstantProperty(Color.ORANGE);
          }
        }
        else if (selectedEvent.geo_type === 'nationwide') {
          entity.polygon.material = new ColorMaterialProperty(Color.YELLOW.withAlpha(0.2));
        }
        // Vấn đề 2: Với 'single_point', chúng ta không làm gì ở đây cả (mặc định là RESET - không tô màu)
      }
    });

    provinceData.entities.resumeEvents();
  }, [selectedEvent, provinceData]);

  return (
    <div className="flex h-screen w-full relative bg-[#00050a]">
      {/* Sidebar - Giữ nguyên của bạn */}
      <div className="w-80 bg-slate-900/95 text-white flex flex-col p-4 z-10 border-r border-slate-800">
        <h2 className="text-xl font-bold mb-4 text-center text-blue-400 uppercase tracking-tight">Vietnam History</h2>
        <div className="flex flex-col gap-2 overflow-y-auto">
          {eventsData.map(ev => (
            <button
              key={ev.id}
              className={`p-3 rounded text-left border transition-all ${selectedEvent?.id === ev.id ? 'bg-blue-600 border-blue-400' : 'bg-slate-800 border-transparent hover:border-slate-600'
                }`}
              onClick={() => setSelectedEvent(ev)}
            >
              <div className="text-[10px] font-bold text-blue-300 uppercase">{ev.start_time.split('T')[0]}</div>
              <div className="text-sm font-medium">{ev.name}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1">
        <Viewer ref={viewerRef} full animation={false} timeline={false} baseLayerPicker={false} geocoder={false}>
          {eventsData.map(ev => {
            if (!ev.coordinates || ev.geo_type === 'no_location') return null;
            const isSelected = selectedEvent?.id === ev.id;

            return (
              <Entity
                key={ev.id}
                position={Cartesian3.fromDegrees(ev.coordinates.lng, ev.coordinates.lat)}
                // VẤN ĐỀ 3: Tăng kích thước Markpoint (pixelSize)
                point={{
                  pixelSize: isSelected ? 18 : 10, // To ra rõ rệt khi được chọn
                  color: isSelected ? Color.CYAN : Color.YELLOW,
                  outlineColor: Color.BLACK,
                  outlineWidth: 2,
                  disableDepthTestDistance: Number.POSITIVE_INFINITY // Đảm bảo marker không bị lấp bởi địa hình
                }}
                // Hiển thị Label để dễ nhìn hơn
                label={{
                  text: isSelected ? ev.name : "",
                  font: '14px sans-serif',
                  fillColor: Color.WHITE,
                  outlineColor: Color.BLACK,
                  outlineWidth: 2,
                  style: 1, // FILL_AND_OUTLINE
                  pixelOffset: new Cartesian3(0, -25, 0),
                  verticalOrigin: 1 // BOTTOM
                }}
                onClick={() => setSelectedEvent(ev)}
              />
            );
          })}

          {selectedEvent?.coordinates && (
            <CameraFlyTo
              destination={Cartesian3.fromDegrees(
                selectedEvent.coordinates.lng,
                selectedEvent.coordinates.lat,
                selectedEvent.geo_type === 'nationwide' ? 2500000 : 800000
              )}
              duration={1.5}
            />
          )}
        </Viewer>
      </div>
    </div>
  );
}