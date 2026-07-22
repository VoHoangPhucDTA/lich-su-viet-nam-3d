import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  Compass,
  Crosshair,
  HelpCircle,
  Info,
  Minus,
  Plus,
  X,
} from 'lucide-react';
import {
  formatHeight,
  formatLatitude,
  formatLongitude,
  inspectionErrorMessage,
  isInspectionFailure,
  type TerrainInspectionHeightStatus,
  type TerrainInspectionResult,
} from '../../utils/terrainInspection';
import type { TerrainDataSourceStatus } from '../../types/terrain';

export type TerrainExplorationMode = 'none' | 'inspect-location';

export interface TerrainExplorationInspectorState {
  result: TerrainInspectionResult | null;
  loading: boolean;
  error: string | null;
}

interface TerrainExplorationToolbarProps {
  /** True ONLY when terrain mode === 'active'. */
  isVisible: boolean;
  /** Serializable terrain-source status; never exposes Cesium runtime objects. */
  terrainDataSourceStatus?: TerrainDataSourceStatus;
  /** Current inspect mode; controls the pressed state of the inspect toggle. */
  inspectMode: TerrainExplorationMode;
  /** Ask the host to switch inspect mode on/off. */
  onToggleInspect: (next: TerrainExplorationMode) => void;
  /** Latest inspection result + loading + error for display. */
  inspectionState: TerrainExplorationInspectorState;
  /** Zoom in. */
  onZoomIn: () => void;
  /** Zoom out. */
  onZoomOut: () => void;
  /** Whether the zoom buttons should be disabled (e.g. during entering/exiting). */
  zoomDisabled?: boolean;
  /** Whether the inspect toggle should be disabled (e.g. when entering). */
  inspectDisabled?: boolean;
}

const buttonStyle = {
  border: '1px solid #d6d3d1',
  borderRadius: '10px',
  background: '#ffffff',
  color: '#292524',
  padding: 0,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const;

function heightStatusLabel(status: TerrainInspectionHeightStatus): string {
  switch (status) {
    case 'available':
      return 'Đã có dữ liệu độ cao từ địa hình 3D.';
    case 'ellipsoid_only':
      return 'Không có dữ liệu độ cao địa hình chi tiết; vị trí hiển thị theo ellipsoid dự phòng.';
    case 'unavailable':
      return 'Không thể xác định vị trí trên bản đồ.';
    case 'error':
      return 'Không thể tải độ cao địa hình tại vị trí này.';
    default:
      return '';
  }
}

function terrainSourceLabel(status: TerrainDataSourceStatus): string {
  switch (status) {
    case 'world-terrain':
      return 'Cesium World Terrain';
    case 'ellipsoid-fallback':
      return 'Mô hình ellipsoid dự phòng';
    case 'loading':
      return 'Đang xác định nguồn địa hình';
    default:
      return 'Nguồn địa hình chưa khả dụng';
  }
}

/**
 * Default CesiumJS 1.139 ScreenSpaceCameraController mappings in 3D mode.
 *
 * Documented in:
 * https://cesium.com/learn/cesiumjs-learn/cesiumjs-camera.html
 *
 * All five enableRotate/enableTilt/enableZoom/enableLook/enableTranslate
 * default to `true`; SceneModePicker being disabled does NOT change gestures.
 * We use these defaults verbatim because the map harness never overrides them.
 */
const NAVIGATION_GUIDE_ROWS: { label: string; description: string }[] = [
  {
    label: 'Kéo chuột trái',
    description: 'Xoay quanh điểm được chọn trên bản đồ.',
  },
  {
    label: 'Cuộn chuột hoặc kéo chuột phải',
    description: 'Phóng to hoặc thu nhỏ.',
  },
  {
    label: 'Kéo chuột giữa hoặc Ctrl + chuột trái',
    description: 'Nghiêng góc nhìn để nhìn địa hình từ trên xuống.',
  },
  {
    label: 'Chạm và kéo một ngón',
    description: 'Xoay bản đồ trên màn hình cảm ứng.',
  },
  {
    label: 'Chụm hoặc kéo hai ngón',
    description: 'Phóng to; kéo hai ngón theo chiều dọc để thay đổi độ nghiêng.',
  },
];

export default function TerrainExplorationToolbar({
  isVisible,
  terrainDataSourceStatus = 'unavailable',
  inspectMode,
  onToggleInspect,
  inspectionState,
  onZoomIn,
  onZoomOut,
  zoomDisabled = false,
  inspectDisabled = false,
}: TerrainExplorationToolbarProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inspectToggleRef = useRef<HTMLButtonElement>(null);
  const closePanelButtonRef = useRef<HTMLButtonElement>(null);
  const panelTitleId = useId();
  const panelId = useId();

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    if (inspectMode === 'inspect-location') onToggleInspect('none');
  }, [inspectMode, onToggleInspect]);

  // Escape closes panel and restores focus to the trigger.
  useEffect(() => {
    if (!panelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Capture must win over MapPage's document-level Escape shortcut.
      event.stopImmediatePropagation();
      event.stopPropagation();
      closePanel();
      toolsButtonRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [panelOpen, closePanel]);

  // When panel opens, move focus into it (focus the close button for safety).
  useEffect(() => {
    if (!panelOpen) return;
    closePanelButtonRef.current?.focus();
  }, [panelOpen]);

  // When turning inspect OFF from this toolbar (via close or toggle), ask
  // host to clear marker + result. Parent already owns the inspector state
  // shape so we only dispatch the mode switch — the parent resets the rest.
  const handleToggleInspect = useCallback(() => {
    const next: TerrainExplorationMode = inspectMode === 'inspect-location'
      ? 'none'
      : 'inspect-location';
    onToggleInspect(next);
  }, [inspectMode, onToggleInspect]);

  const handlePanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Tab-trap is intentionally light: only Escape closes the panel.
    if (event.key === 'Escape') {
      event.stopPropagation();
      closePanel();
      toolsButtonRef.current?.focus();
    }
  };

  if (!isVisible) return null;

  const { result, loading, error } = inspectionState;
  const showResult = !!result;
  const showError = !!error || (!!result && isInspectionFailure(result.heightStatus));
  const errorMessage = error ?? (result ? inspectionErrorMessage(result.heightStatus) : null);
  const statusLabel = result ? heightStatusLabel(result.heightStatus) : null;
  const heightLabel = result?.heightStatus === 'ellipsoid_only'
    ? '—'
    : formatHeight(result?.heightMeters);

  return (
    <div
      className="map-exploration-toolbar"
      data-testid="map-exploration-toolbar"
      role="group"
      aria-label="Công cụ khám phá địa hình"
    >
      <div className="map-exploration-toolbar__buttons" role="toolbar" aria-label="Công cụ thu phóng">
        <button
          type="button"
          onClick={onZoomOut}
          disabled={zoomDisabled}
          aria-label="Thu nhỏ bản đồ 3D"
          title="Thu nhỏ"
          className="map-exploration-button focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            ...buttonStyle,
            width: 44,
            height: 44,
            opacity: zoomDisabled ? 0.55 : 1,
            cursor: zoomDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          <Minus size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onZoomIn}
          disabled={zoomDisabled}
          aria-label="Phóng to bản đồ 3D"
          title="Phóng to"
          className="map-exploration-button focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            ...buttonStyle,
            width: 44,
            height: 44,
            opacity: zoomDisabled ? 0.55 : 1,
            cursor: zoomDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          <Plus size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>
        <button
          ref={toolsButtonRef}
          type="button"
          onClick={() => setPanelOpen((prev) => !prev)}
          aria-expanded={panelOpen}
          aria-controls={panelId}
          aria-label={panelOpen ? 'Thu gọn bảng công cụ khám phá' : 'Mở bảng công cụ khám phá'}          title={panelOpen ? 'Thu gọn công cụ' : 'Mở công cụ'}
            className="map-exploration-button focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            ...buttonStyle,
            width: 44,
            height: 44,
          }}
        >
          <Compass size={18} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>

      {panelOpen && (
        <div
          ref={panelRef}
          className="map-exploration-panel glass-map"
          id={panelId}
          role="dialog"
          aria-labelledby={panelTitleId}
          aria-modal="false"
          onKeyDown={handlePanelKeyDown}
        >
          <div className="map-exploration-panel__header">
            <div className="map-exploration-panel__title-row">
              <h2 id={panelTitleId} className="map-exploration-panel__title serif-heading">
                Công cụ khám phá
              </h2>
              <button
                ref={closePanelButtonRef}
                type="button"
                onClick={closePanel}
                aria-label="Đóng bảng công cụ khám phá"
                className="map-exploration-panel__close focus-visible:outline focus-visible:outline-2"
              >
                <X size={15} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
            <p className="map-exploration-panel__hint">
              Một số thao tác điều khiển camera theo cài đặt mặc định của bản đồ 3D.
            </p>
          </div>

          <section
            className="map-exploration-panel__section"
            aria-labelledby={`${panelTitleId}-help`}
          >
            <div className="map-exploration-panel__section-title">
              <HelpCircle size={14} aria-hidden="true" />
              <h3 id={`${panelTitleId}-help`}>Cách điều khiển</h3>
            </div>
            <ul className="map-exploration-panel__guide">
              {NAVIGATION_GUIDE_ROWS.map((row) => (
                <li key={row.label} className="map-exploration-panel__guide-row">
                  <strong>{row.label}</strong>
                  <span>{row.description}</span>
                </li>
              ))}
            </ul>
          </section>

          <section
            className="map-exploration-panel__section"
            aria-labelledby={`${panelTitleId}-data`}
          >
            <div className="map-exploration-panel__section-title">
              <Info size={14} aria-hidden="true" />
              <h3 id={`${panelTitleId}-data`}>Thông tin dữ liệu</h3>
            </div>
            <dl className="map-exploration-panel__data-list">
              <div>
                <dt>Nguồn địa hình</dt>
                <dd>{terrainSourceLabel(terrainDataSourceStatus)}</dd>
              </div>
              <div>
                <dt>Loại dữ liệu</dt>
                <dd>Địa hình tham chiếu thời hiện đại.</dd>
              </div>
              <div>
                <dt>Mục đích</dt>
                <dd>Hỗ trợ quan sát địa thế, độ cao tương đối và quan hệ không gian.</dd>
              </div>
            </dl>
            <ul className="map-exploration-panel__compact-list">
              <li>Không phải mô hình phục dựng địa hình trong quá khứ.</li>
              <li>Sông, bờ biển, bãi bồi và cảnh quan có thể đã thay đổi.</li>
            </ul>
            <h4 className="map-exploration-panel__subheading">Phạm vi sử dụng</h4>
            <p className="map-exploration-panel__scope-copy">
              Dùng để nhận biết địa thế tổng quát, vị trí tương đối, độ cao tham khảo và phạm vi phân bố của target.
            </p>
            <p className="map-exploration-panel__scope-copy">
              Không dùng để chứng minh tuyến hành quân, dòng chảy, đường bờ hoặc ranh giới lịch sử chính xác; cũng không phục dựng cảnh quan quá khứ.
            </p>
          </section>

          <section
            className="map-exploration-panel__section"
            aria-labelledby={`${panelTitleId}-prompts`}
          >
            <div className="map-exploration-panel__section-title">
              <HelpCircle size={14} aria-hidden="true" />
              <h3 id={`${panelTitleId}-prompts`}>Gợi ý khám phá</h3>
            </div>
            <ol className="map-exploration-panel__prompt-list">
              <li>Khu vực hiện nay thuộc miền núi, đồng bằng, ven biển hay hải đảo?</li>
              <li>Các địa điểm liên quan phân bố tập trung hay phân tán?</li>
              <li>Yếu tố địa lý nào có thể đã thay đổi so với thời điểm xảy ra sự kiện?</li>
            </ol>
          </section>

          <section
            className="map-exploration-panel__section"
            aria-labelledby={`${panelTitleId}-inspect`}
          >
            <div className="map-exploration-panel__section-title">
              <Crosshair size={14} aria-hidden="true" />
              <h3 id={`${panelTitleId}-inspect`}>Xem tọa độ và độ cao</h3>
            </div>
            <button
              ref={inspectToggleRef}
              type="button"
              onClick={handleToggleInspect}
              aria-pressed={inspectMode === 'inspect-location'}
              disabled={inspectDisabled}
              className="map-exploration-inspect-toggle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Crosshair
                size={14}
                aria-hidden="true"
                style={{ marginRight: 8, opacity: 0.75 }}
              />
              {inspectMode === 'inspect-location'
                ? 'Đang chờ bạn chọn vị trí…'
                : 'Bật chọn vị trí trên bản đồ'}
            </button>

            {inspectMode === 'inspect-location' && (
              <p className="map-exploration-panel__status" aria-live="polite">
                Nhấn vào bản đồ để xem vĩ độ, kinh độ và độ cao địa hình.
              </p>
            )}

            {inspectMode === 'inspect-location' && loading && (
              <p className="map-exploration-panel__status" aria-live="polite">
                Đang lấy độ cao địa hình…
              </p>
            )}

            {showResult && result && (
              <div
                className="map-exploration-panel__result"
                aria-live="polite"
                data-testid="map-exploration-result"
              >
                <div className="map-exploration-panel__result-row">
                  <span>Vĩ độ</span>
                  <strong>{formatLatitude(result.latitude)}</strong>
                </div>
                <div className="map-exploration-panel__result-row">
                  <span>Kinh độ</span>
                  <strong>{formatLongitude(result.longitude)}</strong>
                </div>
                <div className="map-exploration-panel__result-row">
                  <span>Độ cao địa hình</span>
                  <strong>
                    {heightLabel}
                    <span className="map-exploration-panel__result-unit" aria-hidden="true" />
                  </strong>
                </div>
                {statusLabel && (
                  <div className="map-exploration-panel__result-note">
                    {statusLabel}
                  </div>
                )}
                <p className="map-exploration-panel__footnote">
                  Độ cao lấy từ mô hình địa hình tham chiếu và chỉ mang tính gần đúng.
                </p>
              </div>
            )}

            {showError && (
              <div className="map-exploration-panel__error" role="status">
                {errorMessage}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
