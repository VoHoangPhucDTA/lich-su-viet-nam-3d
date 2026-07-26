import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  updateAdminEventGeography,
  type AdminCanonicalGeoType,
  type AdminEventDetail,
  type AdminEventGeographyMarker,
  type AdminEventGeographyPayload,
} from '../../services/adminApi';
import { ApiRequestError } from '../../services/apiClient';

type Props = {
  eventId: string;
  detail: AdminEventDetail;
  version: string;
  disabled?: boolean;
  onUpdated: (detail: AdminEventDetail) => void;
  onConflict: () => void;
  onBusyChange?: (busy: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

type RegionOption = { gadmRef: string; label: string };
type MarkerDraft = { name: string; label: string; lat: string; lng: string; confidence: string };

const TYPES: Array<{ value: AdminCanonicalGeoType; label: string }> = [
  { value: 'no_location', label: 'Không có địa điểm' },
  { value: 'nationwide', label: 'Toàn quốc' },
  { value: 'point', label: 'Một điểm' },
  { value: 'multi_point', label: 'Nhiều điểm' },
  { value: 'multi_polygon', label: 'Nhiều vùng hành chính' },
  { value: 'mixed', label: 'Điểm và vùng' },
];
const emptyMarker = (): MarkerDraft => ({
  name: '', label: '', lat: '', lng: '', confidence: '',
});

function markerDraft(marker?: {
  name?: string | null; label?: string | null; lat?: number | null;
  lng?: number | null; confidence?: number | null;
}): MarkerDraft {
  return {
    name: marker?.name ?? '',
    label: marker?.label ?? '',
    lat: marker?.lat == null ? '' : String(marker.lat),
    lng: marker?.lng == null ? '' : String(marker.lng),
    confidence: marker?.confidence == null ? '' : String(marker.confidence),
  };
}

function initialMarkers(detail: AdminEventDetail): MarkerDraft[] {
  const map = detail.geography.mapData;
  const values = map?.markers?.length ? map.markers
    : map?.marker ? [map.marker]
      : detail.geography.lat != null && detail.geography.lng != null
        ? [{ lat: detail.geography.lat, lng: detail.geography.lng }] : [];
  return values.map(markerDraft);
}

function validNumber(value: string, minimum: number, maximum: number) {
  const number = Number(value);
  return value.trim() !== '' && Number.isFinite(number) && number >= minimum && number <= maximum;
}

function apiMarker(value: MarkerDraft): AdminEventGeographyMarker {
  return {
    name: value.name.trim() || null,
    label: value.label.trim() || null,
    lat: Number(value.lat),
    lng: Number(value.lng),
    ...(value.confidence.trim() ? { confidence: Number(value.confidence) } : {}),
  };
}

function provinceOptions(document: unknown): RegionOption[] {
  if (!document || typeof document !== 'object' || !('features' in document)
      || !Array.isArray((document as { features: unknown }).features)) return [];
  return (document as { features: Array<{ properties?: Record<string, unknown> }> }).features
    .flatMap(feature => {
      const ref = feature.properties?.GID_1;
      const label = feature.properties?.NAME_1;
      return typeof ref === 'string' && typeof label === 'string'
        ? [{ gadmRef: ref, label }] : [];
    });
}

export default function AdminEventGeographySection({
  eventId, detail, version, disabled, onUpdated, onConflict, onBusyChange, onDirtyChange,
}: Props) {
  const [geoType, setGeoType] = useState<AdminCanonicalGeoType>(
    detail.geography.canonicalGeoType ?? 'no_location',
  );
  const [markers, setMarkers] = useState<MarkerDraft[]>(() => initialMarkers(detail));
  const [regions, setRegions] = useState<string[]>(detail.geography.mapData?.gadmRefs ?? []);
  const [historicalText, setHistoricalText] = useState(
    detail.geography.historicalLocations.join('\n'),
  );
  const [focusMode, setFocusMode] = useState<'auto' | 'bounds'>(
    detail.geography.mapData?.focusGeometry?.mode === 'bounds' ? 'bounds' : 'auto',
  );
  const [zoom, setZoom] = useState(
    detail.geography.mapData?.focusGeometry?.zoom == null
      ? '' : String(detail.geography.mapData.focusGeometry.zoom),
  );
  const [options, setOptions] = useState<RegionOption[]>([]);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [transitionWarning, setTransitionWarning] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/geojson/vietnam-provinces.json', { credentials: 'same-origin' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('province registry')))
      .then(value => { if (active) setOptions(provinceOptions(value)); })
      .catch(() => { if (active) setOptions([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setGeoType(detail.geography.canonicalGeoType ?? 'no_location');
    setMarkers(initialMarkers(detail));
    setRegions(detail.geography.mapData?.gadmRefs ?? []);
    setHistoricalText(detail.geography.historicalLocations.join('\n'));
    setFocusMode(detail.geography.mapData?.focusGeometry?.mode === 'bounds' ? 'bounds' : 'auto');
    setZoom(detail.geography.mapData?.focusGeometry?.zoom == null
      ? '' : String(detail.geography.mapData.focusGeometry.zoom));
    setDirty(false);
    onDirtyChange?.(false);
  }, [detail, onDirtyChange]);

  const historicalLocations = useMemo(
    () => historicalText.split('\n').map(value => value.trim()).filter(Boolean),
    [historicalText],
  );
  const usesMarkers = geoType === 'point' || geoType === 'multi_point' || geoType === 'mixed';
  const usesRegions = geoType === 'multi_polygon' || geoType === 'mixed';
  const usesBounds = geoType === 'multi_point' || geoType === 'multi_polygon' || geoType === 'mixed';
  const validation = useMemo(() => {
    const errors: string[] = [];
    if (geoType === 'point' && markers.length !== 1) errors.push('Điểm đơn cần đúng một marker.');
    if (geoType === 'multi_point' && markers.length < 2) errors.push('Nhiều điểm cần ít nhất hai marker.');
    if (geoType === 'multi_polygon' && regions.length < 1) errors.push('Cần chọn ít nhất một vùng.');
    if (geoType === 'mixed' && (markers.length < 1 || regions.length < 1)) {
      errors.push('Kiểu hỗn hợp cần ít nhất một marker và một vùng.');
    }
    if (usesMarkers) markers.forEach((marker, index) => {
      if (!validNumber(marker.lat, -90, 90) || !validNumber(marker.lng, -180, 180)) {
        errors.push(`Marker ${index + 1} có tọa độ không hợp lệ.`);
      }
      if (!marker.name.trim() && !marker.label.trim()) {
        errors.push(`Marker ${index + 1} cần tên hoặc nhãn.`);
      }
    });
    if (zoom && (!validNumber(zoom, 1, 20))) errors.push('Zoom phải từ 1 đến 20.');
    if (historicalLocations.length > 100) errors.push('Tối đa 100 địa danh lịch sử.');
    return errors;
  }, [geoType, historicalLocations.length, markers, regions.length, usesMarkers, zoom]);

  const markDirty = () => {
    setDirty(true);
    setMessage('');
    setError('');
    onDirtyChange?.(true);
  };
  const changeType = (next: AdminCanonicalGeoType) => {
    if (next === geoType) return;
    const removed: string[] = [];
    if (!['point', 'multi_point', 'mixed'].includes(next) && markers.length) {
      setMarkers([]);
      removed.push('marker');
    }
    if (!['multi_polygon', 'mixed'].includes(next) && regions.length) {
      setRegions([]);
      removed.push('vùng');
    }
    if (next === 'point') {
      setMarkers(previous => [previous[0] ?? emptyMarker()]);
    }
    if (next === 'multi_point' && markers.length < 2) {
      setMarkers(previous => [previous[0] ?? emptyMarker(), emptyMarker()]);
    }
    setGeoType(next);
    setFocusMode('auto');
    setZoom('');
    setTransitionWarning(removed.length
      ? `Đổi loại sẽ loại bỏ dữ liệu không tương thích: ${removed.join(', ')}.`
      : '');
    markDirty();
  };
  const updateMarker = (index: number, field: keyof MarkerDraft, value: string) => {
    setMarkers(previous => previous.map((marker, markerIndex) =>
      markerIndex === index ? { ...marker, [field]: value } : marker));
    markDirty();
  };
  const moveMarker = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= markers.length) return;
    setMarkers(previous => {
      const copy = [...previous];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
    markDirty();
  };

  const payload = (): AdminEventGeographyPayload => {
    const base = {
      historicalLocations,
      focus: usesBounds
        ? { mode: focusMode, ...(zoom ? { zoom: Number(zoom) } : {}) }
        : { mode: 'auto' as const, ...(geoType === 'point' && zoom ? { zoom: Number(zoom) } : {}) },
    };
    if (geoType === 'point') return { ...base, geoType, marker: apiMarker(markers[0]) };
    if (geoType === 'multi_point') return { ...base, geoType, markers: markers.map(apiMarker) };
    if (geoType === 'multi_polygon') {
      return { ...base, geoType, regions: regions.map(gadmRef => ({ gadmRef })) };
    }
    if (geoType === 'mixed') {
      return { ...base, geoType, markers: markers.map(apiMarker), regions: regions.map(gadmRef => ({ gadmRef })) };
    }
    return { ...base, geoType };
  };

  const save = async () => {
    if (disabled || busy || !dirty || validation.length) return;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    setMessage('');
    try {
      const updated = await updateAdminEventGeography(eventId, {
        expectedUpdatedAt: version,
        geography: payload(),
      });
      onUpdated(updated);
      setDirty(false);
      onDirtyChange?.(false);
      setTransitionWarning('');
      setMessage('Đã lưu dữ liệu địa lý.');
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.code === 'EVENT_UPDATE_CONFLICT') onConflict();
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật dữ liệu địa lý.');
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  const labels = regions.map(ref => options.find(option => option.gadmRef === ref)?.label
    ?? detail.geography.provinceNames[regions.indexOf(ref)] ?? ref);
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5" aria-labelledby="admin-geography-title">
      <h2 id="admin-geography-title" className="text-lg font-bold text-[var(--text-primary)]">Địa lý và mapData</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Chỉnh sửa cấu trúc an toàn; backend tự tạo mapData và hình học hiển thị.
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-[var(--accent)]">{error}</p>}
      {message && <p role="status" className="mt-3 text-sm text-emerald-600">{message}</p>}
      {transitionWarning && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{transitionWarning}</p>}
      <div className="mt-4 grid gap-4">
        <label className="text-sm font-semibold">Loại địa lý
          <select aria-label="Loại địa lý" value={geoType}
            disabled={disabled || busy}
            onChange={event => changeType(event.target.value as AdminCanonicalGeoType)}>
            {TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
        {usesMarkers && <div className="space-y-3" aria-label="Danh sách marker">
          {markers.map((marker, index) => (
            <fieldset key={index} className="grid gap-2 rounded-lg border border-[var(--border)] p-3 md:grid-cols-2">
              <legend className="px-1 text-sm font-semibold">Marker {index + 1}</legend>
              <label className="text-xs">Tên<input aria-label={`Tên marker ${index + 1}`} value={marker.name} onChange={event => updateMarker(index, 'name', event.target.value)} /></label>
              <label className="text-xs">Nhãn<input aria-label={`Nhãn marker ${index + 1}`} value={marker.label} onChange={event => updateMarker(index, 'label', event.target.value)} /></label>
              <label className="text-xs">Vĩ độ<input type="number" step="any" aria-label={`Vĩ độ marker ${index + 1}`} value={marker.lat} onChange={event => updateMarker(index, 'lat', event.target.value)} /></label>
              <label className="text-xs">Kinh độ<input type="number" step="any" aria-label={`Kinh độ marker ${index + 1}`} value={marker.lng} onChange={event => updateMarker(index, 'lng', event.target.value)} /></label>
              <label className="text-xs">Độ tin cậy<input type="number" min="0" max="1" step="any" aria-label={`Độ tin cậy marker ${index + 1}`} value={marker.confidence} onChange={event => updateMarker(index, 'confidence', event.target.value)} /></label>
              {geoType !== 'point' && <div className="flex items-end gap-2">
                <button type="button" disabled={disabled || busy || index === 0} onClick={() => moveMarker(index, -1)} aria-label={`Di chuyển marker ${index + 1} lên`}>↑</button>
                <button type="button" disabled={disabled || busy || index === markers.length - 1} onClick={() => moveMarker(index, 1)} aria-label={`Di chuyển marker ${index + 1} xuống`}>↓</button>
                <button type="button" disabled={disabled || busy} onClick={() => { setMarkers(previous => previous.filter((_, i) => i !== index)); markDirty(); }}>Xóa marker</button>
              </div>}
            </fieldset>
          ))}
          {geoType !== 'point' && <button type="button" disabled={disabled || busy || markers.length >= 100}
            onClick={() => { setMarkers(previous => [...previous, emptyMarker()]); markDirty(); }}>Thêm marker</button>}
        </div>}
        {usesRegions && <div>
          <label className="text-sm font-semibold">Vùng được duyệt
            <select aria-label="Thêm vùng" value={selectedRegion} onChange={event => setSelectedRegion(event.target.value)}>
              <option value="">Chọn vùng…</option>
              {options.filter(option => !regions.includes(option.gadmRef)).map(option =>
                <option key={option.gadmRef} value={option.gadmRef}>{option.label} ({option.gadmRef})</option>)}
            </select>
          </label>
          <button type="button" disabled={!selectedRegion || disabled || busy} onClick={() => {
            setRegions(previous => [...previous, selectedRegion]);
            setSelectedRegion('');
            markDirty();
          }}>Thêm vùng</button>
          <ol className="mt-2 space-y-1 text-sm">
            {regions.map((ref, index) => <li key={ref}>
              {labels[index]} ({ref}){' '}
              <button type="button" disabled={disabled || busy}
                onClick={() => { setRegions(previous => previous.filter(value => value !== ref)); markDirty(); }}>Bỏ</button>
            </li>)}
          </ol>
        </div>}
        <label className="text-sm font-semibold">Địa danh lịch sử (mỗi dòng một nhãn)
          <textarea aria-label="Địa danh lịch sử" rows={3} value={historicalText}
            onChange={event => { setHistoricalText(event.target.value); markDirty(); }} />
        </label>
        {(usesBounds || geoType === 'point') && <div className="grid gap-3 md:grid-cols-2">
          {usesBounds && <label className="text-sm font-semibold">Chế độ focus
            <select aria-label="Chế độ focus" value={focusMode}
              onChange={event => { setFocusMode(event.target.value as 'auto' | 'bounds'); markDirty(); }}>
              <option value="auto">Tự động</option><option value="bounds">Theo vùng bao</option>
            </select>
          </label>}
          <label className="text-sm font-semibold">Zoom tùy chọn
            <input aria-label="Zoom tùy chọn" type="number" min="1" max="20" value={zoom}
              onChange={event => { setZoom(event.target.value); markDirty(); }} />
          </label>
        </div>}
      </div>
      <div className="mt-5 rounded-lg bg-[var(--bg-secondary)] p-4 text-sm">
        <h3 className="font-semibold">Xem trước P0</h3>
        <p>Loại: {geoType} · {usesMarkers ? markers.length : 0} marker · {usesRegions ? regions.length : 0} vùng</p>
        {labels.length > 0 && <p>Vùng: {labels.join(', ')}</p>}
        <p>{validation.length ? `${validation.length} lỗi cần sửa` : 'Dữ liệu nhập hợp lệ; độ đầy đủ sẽ được backend đánh giá khi lưu.'}</p>
        {validation.map(value => <p key={value} className="text-[var(--accent)]">{value}</p>)}
        <Link to={`/map?event=${encodeURIComponent(detail.core.slug || eventId)}`}>Mở bản đồ hiện có</Link>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)]">Phiên bản: {version}</span>
        <button type="button" className="admin-primary-button"
          disabled={disabled || busy || !dirty || validation.length > 0}
          onClick={() => void save()}>{busy ? 'Đang lưu…' : 'Lưu địa lý'}</button>
      </div>
    </section>
  );
}
