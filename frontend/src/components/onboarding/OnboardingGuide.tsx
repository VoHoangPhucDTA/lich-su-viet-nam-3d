import { useState, useCallback } from 'react';
import { Compass, X, ChevronUp, Clock, List, MapPin, BookOpen } from 'lucide-react';

const STORAGE_KEY = 'lsvn3d_map_guide_seen';

interface Step {
  icon: typeof Clock;
  label: string;
  desc: string;
}

const STEPS: Step[] = [
  {
    icon: Clock,
    label: 'Chọn mốc thời gian',
    desc: 'Kéo thanh Timeline bên dưới hoặc chọn Lớp (10/11/12) để khoanh vùng thời kỳ lịch sử bạn muốn khám phá.',
  },
  {
    icon: List,
    label: 'Chọn sự kiện từ danh sách',
    desc: 'Nhấp vào một sự kiện trong danh sách bên trái. Dùng thanh tìm kiếm hoặc bộ lọc thể loại để thu hẹp kết quả.',
  },
  {
    icon: MapPin,
    label: 'Khám phá trên bản đồ',
    desc: 'Bản đồ 3D sẽ bay đến địa điểm diễn ra sự kiện. Các marker gần nhau được gộp cụm — phóng to để xem chi tiết.',
  },
  {
    icon: BookOpen,
    label: 'Xem thông tin chi tiết',
    desc: 'Đọc mô tả, thời gian, địa điểm và các sự kiện con ở bảng bên phải. Nhấn "Xem chi tiết" để tìm hiểu sâu hơn.',
  },
];

export function useMapGuide() {
  // Lazy initializer: read localStorage synchronously on first render,
  // so there's no flash between initial false → true in an effect.
  const [isOpen, setIsOpen] = useState(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    return !seen; // auto-open only on first visit
  });

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return { isOpen, dismiss, toggle };
}

interface OnboardingGuideProps {
  isOpen: boolean;
  onDismiss: () => void;
  onToggle: () => void;
}

/**
 * Renders an interactive onboarding guide for the map interface.
 *
 * @param isOpen - Whether the guide panel is expanded
 * @param onDismiss - Permanently closes the guide
 * @param onToggle - Expands or temporarily collapses the guide
 */
export default function OnboardingGuide({
  isOpen,
  onDismiss,
  onToggle,
}: OnboardingGuideProps) {
  return (
    <>
      {/* Toggle button — visible when guide is closed */}
      {!isOpen && (
        <button
          onClick={onToggle}
          aria-label="Mở hướng dẫn"
          title="Hướng dẫn sử dụng"
          className="glass-map animate-fade-in"
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            padding: '8px 14px',
            borderRadius: '999px',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: '12.5px',
            fontWeight: 600,
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(12px)',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all 0.2s var(--ease-museum)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.borderColor = 'var(--accent)';
            e.currentTarget.style.color = 'var(--accent)';
            e.currentTarget.style.boxShadow = 'var(--shadow-glow)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.9)';
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
          }}
        >
          <Compass size={14} strokeWidth={2} />
          Hướng dẫn
        </button>
      )}

      {/* Guide panel — smooth slide + fade via max-height & opacity */}
      <div
        className="glass-map"
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          zIndex: 20,
          maxWidth: '380px',
          width: 'calc(100% - 32px)',
          borderRadius: '14px',
          overflow: 'hidden',
          boxShadow: 'var(--shadow)',
          maxHeight: isOpen ? '600px' : '0',
          opacity: isOpen ? 1 : 0,
          transform: isOpen
            ? 'translateY(0) scaleY(1)'
            : 'translateY(-8px) scaleY(0.95)',
          transformOrigin: 'top left',
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'all 0.4s var(--ease-museum)',
        }}
      >
        {/* Gold accent top bar */}
        <div
          style={{
            height: '3px',
            background:
              'linear-gradient(to right, var(--accent), var(--admin-accent), transparent)',
          }}
        />

        <div style={{ padding: '14px 16px 16px' }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '9px',
                  background: 'var(--accent-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Compass
                  size={16}
                  strokeWidth={1.8}
                  style={{ color: 'var(--accent)' }}
                />
              </div>
              <h3
                className="app-heading"
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                Hướng dẫn sử dụng bản đồ
              </h3>
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
              {/* Collapse button (temporary hide) */}
              <button
                onClick={onToggle}
                aria-label="Thu gọn hướng dẫn"
                title="Thu gọn"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'flex',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-card)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-surface)';
                  e.currentTarget.style.color = 'var(--text-muted)';
                }}
              >
                <ChevronUp size={13} strokeWidth={2.4} />
              </button>
              {/* Permanently dismiss */}
              <button
                onClick={onDismiss}
                aria-label="Đóng hướng dẫn vĩnh viễn"
                title="Đóng (không hiện lại)"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'flex',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--danger-soft)';
                  e.currentTarget.style.color = 'var(--danger)';
                  e.currentTarget.style.borderColor = 'var(--danger)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-surface)';
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                <X size={13} strokeWidth={2.4} />
              </button>
            </div>
          </div>

          {/* Intro text */}
          <p
            style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              marginBottom: '12px',
              paddingBottom: '10px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            Làm theo 4 bước đơn giản dưới đây để khám phá lịch sử Việt Nam qua
            bản đồ 3D tương tác.
          </p>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {STEPS.map((step, i) => (
              <div
                key={i}
                className="museum-card"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '9px 10px',
                  borderRadius: '10px',
                  cursor: 'default',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent-soft)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {/* Step number badge */}
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '7px',
                    background: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '1px',
                  }}
                >
                  <span
                    style={{
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: 700,
                      fontFamily: 'var(--font-label)',
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '2px',
                    }}
                  >
                    <step.icon
                      size={12}
                      strokeWidth={2.2}
                      style={{ color: 'var(--accent)', flexShrink: 0 }}
                    />
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {step.label}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              marginTop: '10px',
              paddingTop: '8px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                fontStyle: 'italic',
              }}
            >
              Nhấn ✕ để đóng vĩnh viễn · Nhấn ▲ để thu gọn tạm thời
            </span>

            <button
              onClick={onDismiss}
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--accent)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '6px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--accent-soft)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              Đã hiểu
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
