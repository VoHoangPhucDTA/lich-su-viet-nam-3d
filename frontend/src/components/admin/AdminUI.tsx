import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronLeft, ChevronRight, LoaderCircle, Search } from 'lucide-react';

// --- AdminPageHeader ---------------------------------------------------------

interface AdminPageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function AdminPageHeader({ eyebrow, title, description, actions }: AdminPageHeaderProps) {
  return (
    <div
      className="admin-page-header mb-7 flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p
            className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: 'var(--text-secondary)' }}
          >
            {eyebrow}
          </p>
        )}
        <h1
          className="admin-page-title text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// --- AdminSearchInput --------------------------------------------------------

interface AdminSearchInputProps {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  onSubmit?: () => void;
}

export function AdminSearchInput({
  value,
  onChange,
  placeholder = 'Tìm kiếm...',
  onSubmit,
}: AdminSearchInputProps) {
  return (
    <label className="admin-search-field">
      <Search size={16} aria-hidden="true" className="shrink-0" />
      <input
        value={value}
        onChange={onChange}
        onKeyDown={event => event.key === 'Enter' && onSubmit?.()}
        placeholder={placeholder}
        aria-label={placeholder}
        className="admin-search-input"
      />
    </label>
  );
}

// --- AdminSelect -------------------------------------------------------------

export interface AdminSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface AdminSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: AdminSelectOption[];
  label: string;
  compact?: boolean;
  disabled?: boolean;
  error?: string;
  describedBy?: string;
  visibleLabel?: boolean;
}

/**
 * Select-only combobox (listbox popup) used by every Admin filter and form
 * select. The trigger is a real button; the popup is portaled to document.body
 * with fixed positioning so it is never clipped by `overflow: hidden` table or
 * filter containers. Keyboard contract: Enter/Space open+select, ArrowUp/Down
 * navigate, Home/End jump, Escape closes without change, Tab closes and moves
 * focus, printable characters typeahead.
 */
export function AdminSelect({
  value,
  onValueChange,
  options,
  label,
  compact = false,
  disabled = false,
  error,
  describedBy,
  visibleLabel = false,
}: AdminSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const errorId = useId();
  const typeaheadRef = useRef<{ buffer: string; timer: number }>({ buffer: '', timer: 0 });

  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));
  const selected = options[selectedIndex] ?? options[0];

  const positionMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const estimatedHeight = Math.min(options.length, 8) * 40 + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < estimatedHeight && rect.top > estimatedHeight;
    setMenuStyle({
      top: openUp ? rect.top - estimatedHeight : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      minWidth: Math.max(rect.width, 176),
    });
  }, [options.length]);

  useEffect(() => {
    if (!open) return;
    positionMenu();
    const reposition = () => positionMenu();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, positionMenu]);

  useEffect(() => {
    if (!open) return;
    // The popup is portaled to document.body, so treat both the trigger root and
    // the portaled listbox as "inside": closing on mousedown before the option's
    // click event fires would make mouse selection impossible.
    const closeOnOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('touchstart', closeOnOutside);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('touchstart', closeOnOutside);
    };
  }, [open]);

  const openMenu = () => {
    setActiveIndex(Math.max(0, options.findIndex(option => option.value === value)));
    positionMenu();
    setOpen(true);
  };

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const selectOption = (option: AdminSelectOption) => {
    if (option.disabled) return;
    onValueChange(option.value);
    closeMenu(true);
  };

  const moveActive = (direction: 1 | -1) => {
    setActiveIndex(previous => {
      const enabled = options
        .map((option, index) => (option.disabled ? -1 : index))
        .filter(index => index >= 0);
      if (!enabled.length) return previous;
      const current = enabled.indexOf(previous);
      const anchor = current === -1 ? 0 : current;
      return enabled[(anchor + direction + enabled.length) % enabled.length];
    });
  };

  const jumpTo = (edge: 'first' | 'last') => {
    const enabled = options
      .map((option, index) => (option.disabled ? -1 : index))
      .filter(index => index >= 0);
    if (!enabled.length) return;
    setActiveIndex(edge === 'first' ? enabled[0] : enabled[enabled.length - 1]);
  };

  const handleTypeahead = (char: string) => {
    const now = Date.now();
    const buffer = now - typeaheadRef.current.timer > 800 ? char : typeaheadRef.current.buffer + char;
    typeaheadRef.current = { buffer, timer: now };
    const needle = buffer.toLowerCase();
    setActiveIndex(previous => {
      const enabled = options
        .map((option, index) => (option.disabled ? -1 : index))
        .filter(index => index >= 0);
      const start = Math.max(0, enabled.indexOf(previous)) + 1;
      for (let i = 0; i < enabled.length; i += 1) {
        const index = enabled[(start + i) % enabled.length];
        if (options[index].label.toLowerCase().startsWith(needle)) return index;
      }
      return previous;
    });
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openMenu();
        // Open on the next/previous option, mirroring native select behaviour.
        moveActive(event.key === 'ArrowDown' ? 1 : -1);
      } else {
        moveActive(event.key === 'ArrowDown' ? 1 : -1);
      }
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if (!open) openMenu();
      jumpTo(event.key === 'Home' ? 'first' : 'last');
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) {
        const option = options[activeIndex];
        if (option) selectOption(option);
      } else {
        openMenu();
      }
      return;
    }
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        closeMenu(true);
      }
      return;
    }
    if (open && event.key.length === 1) handleTypeahead(event.key);
  };

  return (
    <div ref={rootRef} className={`admin-dropdown ${compact ? 'admin-dropdown-compact' : ''}`}>
      {visibleLabel && <span className="admin-field-label">{label}</span>}
      <div className="admin-select-control">
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          className="admin-dropdown-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          aria-label={label}
          aria-invalid={Boolean(error)}
          aria-describedby={[describedBy, error ? errorId : ''].filter(Boolean).join(' ') || undefined}
          disabled={disabled}
          onClick={() => (open ? closeMenu() : openMenu())}
          onKeyDown={handleTriggerKeyDown}
          onBlur={() => setOpen(false)}
        >
          <span className="truncate">{selected?.label ?? label}</span>
          <ChevronDown
            className={`admin-dropdown-chevron ${open ? 'admin-dropdown-chevron-open' : ''}`}
            size={16}
            aria-hidden="true"
          />
        </button>
        {open && createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-label={label}
            className="admin-dropdown-menu"
            style={{ position: 'fixed', zIndex: 80, ...menuStyle }}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                className={`admin-dropdown-option ${option.value === value ? 'admin-dropdown-option-selected' : ''} ${index === activeIndex ? 'admin-dropdown-option-active' : ''} ${option.disabled ? 'admin-dropdown-option-disabled' : ''}`}
                onClick={() => selectOption(option)}
                onMouseMove={() => !option.disabled && setActiveIndex(index)}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {option.value === value && <Check size={14} aria-hidden="true" className="shrink-0" />}
              </div>
            ))}
          </div>,
          document.body,
        )}
      </div>
      {error && <span id={errorId} role="alert" className="mt-1 block text-xs text-[var(--accent)]">{error}</span>}
    </div>
  );
}

interface AdminFilterSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: AdminSelectOption[];
  label?: string;
}

export function AdminFilterSelect({ value, onValueChange, options, label = 'Bộ lọc' }: AdminFilterSelectProps) {
  return <AdminSelect value={value} onValueChange={onValueChange} options={options} label={label} />;
}

// --- Admin form primitives ---------------------------------------------------

interface AdminFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  error?: string;
  hint?: string;
}

export function AdminField({ label, error, hint, id: providedId, required, ...props }: AdminFieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="admin-field">
      <label htmlFor={id} className="admin-field-label">
        {label}{required && <span className="ml-1 text-[var(--accent)]" aria-hidden="true">*</span>}
      </label>
      <input
        {...props}
        id={id}
        required={required}
        aria-required={required || undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className="admin-form-input"
      />
      {hint && <span id={hintId} className="admin-field-hint">{hint}</span>}
      {error && <span id={errorId} role="alert" className="admin-field-error">{error}</span>}
    </div>
  );
}

interface AdminTextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  label: string;
  error?: string;
  hint?: string;
}

export function AdminTextArea({ label, error, hint, id: providedId, required, ...props }: AdminTextAreaProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="admin-field">
      <label htmlFor={id} className="admin-field-label">
        {label}{required && <span className="ml-1 text-[var(--accent)]" aria-hidden="true">*</span>}
      </label>
      <textarea
        {...props}
        id={id}
        required={required}
        aria-required={required || undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className="admin-form-input admin-textarea"
      />
      {hint && <span id={hintId} className="admin-field-hint">{hint}</span>}
      {error && <span id={errorId} role="alert" className="admin-field-error">{error}</span>}
    </div>
  );
}

export function AdminCheckbox({
  label,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> & { label: string }) {
  return (
    <label className="admin-checkbox">
      <input {...props} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}

export function AdminActionButton({
  variant = 'primary',
  className = '',
  pending = false,
  type,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'text';
  pending?: boolean;
}) {
  const computedType = (type ?? 'button') as 'button' | 'submit' | 'reset';
  const computedDisabled = disabled || pending;
  return (
    <button
      {...props}
      type={computedType}
      disabled={computedDisabled}
      data-pending={pending ? 'true' : undefined}
      aria-busy={pending || undefined}
      className={`admin-${variant}-button ${className}`.trim()}
    >
      {children}
    </button>
  );
}

// --- AdminTooltip / AdminIconButton / AdminIconLink -------------------------

/**
 * Tooltip that appears on hover and keyboard focus. The popup is portaled to
 * document.body with fixed positioning computed from the trigger rect, so it is
 * never clipped by an `overflow: hidden/auto` table or card container. The
 * accessible name always lives on the wrapped control (aria-label), never on
 * the tooltip alone.
 */
export function AdminTooltip({ label, children }: { label: string; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const hostRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

  const position = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const height = 28;
    const above = rect.top - height - 6 > 0;
    setStyle({
      top: above ? rect.top - 6 : rect.bottom + 6,
      left: rect.left + rect.width / 2,
      transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    position();
    const reposition = () => position();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [visible, position]);

  const show = () => {
    position();
    setVisible(true);
  };

  return (
    <span
      ref={hostRef}
      className="admin-tooltip-host"
      onMouseEnter={show}
      onMouseLeave={() => setVisible(false)}
      onFocus={show}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && createPortal(
        <span
          id={tooltipId}
          role="tooltip"
          className="admin-tooltip"
          style={{
            position: 'fixed',
            zIndex: 90,
            whiteSpace: 'nowrap',
            maxWidth: '16rem',
            ...style,
          }}
        >
          {label}
        </span>,
        document.body,
      )}
    </span>
  );
}

export type AdminIconButtonVariant = 'neutral' | 'primary' | 'danger' | 'outline' | 'warning';

/**
 * Icon-only action button with a real accessible name, optional CSS tooltip,
 * pending lock and double-submit guard. Defaults to `type="button"`.
 */
export function AdminIconButton({
  label,
  tooltip,
  variant = 'neutral',
  pending = false,
  className = '',
  type,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tooltip?: string;
  variant?: AdminIconButtonVariant;
  pending?: boolean;
}) {
  const computedType = (type ?? 'button') as 'button' | 'submit' | 'reset';
  const computedDisabled = disabled || pending;
  const button = (
    <button
      {...props}
      type={computedType}
      aria-label={label}
      disabled={computedDisabled}
      data-pending={pending ? 'true' : undefined}
      aria-busy={pending || undefined}
      className={`admin-icon-button admin-icon-button-${variant} ${className}`.trim()}
    >
      {pending
        ? <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
        : children}
    </button>
  );
  return tooltip ? <AdminTooltip label={tooltip}>{button}</AdminTooltip> : button;
}



export function AdminInlineAlert({
  tone,
  children,
  className = '',
}: {
  tone: 'success' | 'error' | 'warning' | 'info';
  children: ReactNode;
  className?: string;
}) {
  const role = tone === 'error' ? 'alert' : 'status';
  return (
    <div role={role} aria-live={tone === 'error' ? 'assertive' : 'polite'} className={`admin-inline-alert admin-inline-alert-${tone} ${className}`.trim()}>
      {children}
    </div>
  );
}
// --- AdminStatusBadge --------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  active: 'Hoạt động', pending: 'Chờ xác thực', disabled: 'Đã khóa', draft: 'Bản nháp', published: 'Đã xuất bản', archived: 'Lưu trữ', atomic: 'Sự kiện đơn', collection: 'Bộ sưu tập', student: 'Học sinh', admin: 'Quản trị',
};
const STATUS_STYLES: Record<string, CSSProperties> = {
  active: { borderColor: 'rgba(52,168,83,.3)', background: 'rgba(52,168,83,.08)', color: '#276c38' },
  pending: { borderColor: 'rgba(197,160,89,.4)', background: 'rgba(197,160,89,.1)', color: '#8f682d' },
  disabled: { borderColor: 'rgba(139,30,30,.25)', background: 'var(--accent-soft)', color: 'var(--accent)' },
  draft: { borderColor: 'rgba(197,160,89,.4)', background: 'rgba(197,160,89,.1)', color: '#8f682d' },
  published: { borderColor: 'rgba(52,168,83,.3)', background: 'rgba(52,168,83,.08)', color: '#276c38' },
  archived: { borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)' },
  atomic: { borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)' },
  collection: {
    borderColor: 'rgba(197,160,89,.35)',
    background: 'var(--admin-accent-soft)',
    color: '#8f682d',
  },
  student: { borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)' },
  admin: { borderColor: 'rgba(139,30,30,.2)', background: 'var(--accent-soft)', color: 'var(--accent)' },
};

export function AdminStatusBadge({ status, label }: { status: string; label?: string }) {
  const style = STATUS_STYLES[status] ?? {
    borderColor: 'var(--border)',
    background: 'var(--bg-surface)',
    color: 'var(--text-muted)',
  };
  return (
    <span
      className="admin-status-badge inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold"
      style={style}
    >
      {label ?? STATUS_LABELS[status] ?? status}
    </span>
  );
}

// --- AdminPagination ---------------------------------------------------------

function getPageItems(currentPage: number, pageCount: number): Array<number | 'ellipsis-start' | 'ellipsis-end'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  if (currentPage <= 4) return [1, 2, 3, 4, 5, 'ellipsis-end', pageCount];
  if (currentPage >= pageCount - 3) return [1, 'ellipsis-start', pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  return [1, 'ellipsis-start', currentPage - 1, currentPage, currentPage + 1, 'ellipsis-end', pageCount];
}
export function AdminPagination({ total, offset, limit, loading, onChange }: { total: number; offset: number; limit: number; loading: boolean; onChange: (offset: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(pageCount, Math.floor(offset / limit) + 1);
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const pageItems = getPageItems(currentPage, pageCount);
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--text-muted)] sm:px-5"><span>Hiển thị {from}–{to} trong {total} bản ghi</span><nav aria-label="Phân trang" className="flex items-center gap-1"><button type="button" className="admin-icon-button" aria-label="Trang trước" disabled={currentPage === 1 || loading} onClick={() => onChange(Math.max(0, offset - limit))}><ChevronLeft size={15} aria-hidden="true" /></button>{pageItems.map((item, index) => typeof item === 'number' ? <button key={item} type="button" aria-label={`Trang ${item}`} aria-current={item === currentPage ? 'page' : undefined} disabled={loading} onClick={() => onChange((item - 1) * limit)} className="inline-flex h-9 min-w-9 items-center justify-center rounded-[var(--admin-radius)] border px-2 text-xs font-semibold transition" style={{ borderColor: item === currentPage ? 'var(--accent)' : 'transparent', background: item === currentPage ? 'var(--accent)' : 'transparent', color: item === currentPage ? '#fff' : 'var(--text-secondary)' }}>{item}</button> : <span key={`${item}-${index}`} className="inline-flex h-9 min-w-7 items-center justify-center" aria-hidden="true">…</span>)}<button type="button" className="admin-icon-button" aria-label="Trang sau" disabled={currentPage === pageCount || loading} onClick={() => onChange(offset + limit)}><ChevronRight size={15} aria-hidden="true" /></button></nav><span className="hidden sm:inline">{limit} / trang</span></div>;
}export function AdminLoadingState({ label = 'Đang tải dữ liệu…' }: { label?: string }) {
  return (
    <div
      className="admin-state admin-state-loading flex min-h-48 items-center justify-center gap-3 text-sm"
      role="status"
      aria-live="polite"
      style={{ color: 'var(--text-muted)' }}
    >
      <span
        className="h-4 w-4 animate-spin rounded-full border-2"
        style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
        aria-hidden="true"
      />
      {label}
    </div>
  );
}

// --- AdminEmptyState ---------------------------------------------------------

export function AdminEmptyState({
  title = 'Chưa có dữ liệu',
  description = 'Không tìm thấy dữ liệu phù hợp.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="admin-state admin-state-empty flex min-h-48 flex-col items-center justify-center px-5 text-center" role="status">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h2>
      <p className="mt-1 max-w-md text-xs leading-5" style={{ color: 'var(--text-muted)' }}>
        {description}
      </p>
    </div>
  );
}

// --- AdminErrorState ---------------------------------------------------------

export function AdminErrorState({
  message = 'Không thể tải dữ liệu.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="admin-state admin-state-error flex min-h-48 flex-col items-center justify-center px-5 text-center" role="alert">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
        {message}
      </h2>
      {onRetry && (
        <button type="button" onClick={onRetry} className="admin-text-button mt-3">
          Thử lại
        </button>
      )}
    </div>
  );
}

// --- AdminConfirmDialog ------------------------------------------------------

export function AdminConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Xác nhận',
  onConfirm,
  onCancel,
  danger = false,
  children,
  confirmDisabled = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  children?: ReactNode;
  confirmDisabled?: boolean;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const invokerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    invokerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const appRoot = document.getElementById('root');
    const wasInert = appRoot?.hasAttribute('inert') ?? false;
    appRoot?.setAttribute('inert', '');
    const timer = window.setTimeout(() => cancelRef.current?.focus(), 20);
    return () => {
      window.clearTimeout(timer);
      if (!wasInert) appRoot?.removeAttribute('inert');
      invokerRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
      style={{ background: 'rgba(28,25,23,0.3)' }}
      onMouseDown={event => event.target === event.currentTarget && onCancel()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="admin-dialog w-full max-w-md p-5"
        style={{
          borderRadius: 'var(--admin-radius)',
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          boxShadow: '0 8px 32px rgba(28,25,23,0.12)',
        }}
      >
        <h2
          id={titleId}
          className="text-2xl font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            {description}
          </p>
        )}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className="admin-secondary-button">
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={danger ? 'admin-danger-button' : 'admin-primary-button'}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// --- AdminFormSection --------------------------------------------------------

export function AdminFormSection({
  id,
  title,
  description,
  status,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="admin-form-section p-5 sm:p-6"
      style={{
        borderRadius: 'var(--admin-radius)',
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        boxShadow: 'var(--admin-shadow)',
      }}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {description}
            </p>
          )}
        </div>
        {status}
      </div>
      {children}
    </section>
  );
}

// --- AdminRowActions ---------------------------------------------------------

export function AdminRowActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-1.5">{children}</div>;
}

// --- AdminDataTable ----------------------------------------------------------
// Generic table wrapper — use when ≥2 pages share the same table structure.

export interface AdminDataColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  width?: string;
}

export interface AdminDataTableProps<T> {
  columns: AdminDataColumn<T>[];
  rows: T[];
  getKey: (row: T) => string;
  minWidth?: string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  footer?: ReactNode;
  caption?: string;
}

export function AdminDataTable<T>({
  columns,
  rows,
  getKey,
  minWidth = '40rem',
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  footer,
  caption = 'Bảng dữ liệu quản trị',
}: AdminDataTableProps<T>) {
  if (loading) return <AdminLoadingState />;
  if (error) return <AdminErrorState message={error} onRetry={onRetry} />;
  if (rows.length === 0)
    return <AdminEmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <>
      <div
        className="admin-table-region"
        role="region"
        aria-label={caption}
        tabIndex={0}
        style={{ '--admin-table-min-width': minWidth } as CSSProperties}
      >
        <table
          className="admin-data-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.875rem',
          }}
        >
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-app)' }}>
              {columns.map(col => (
                <th
                  key={col.key}
                  scope="col"
                  style={{
                    padding: '0.75rem 1rem',
                    textAlign: 'left',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    whiteSpace: 'nowrap',
                    width: col.width,
                  }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={getKey(row)}
                style={{ borderBottom: '1px solid var(--border)', transition: 'background 120ms ease' }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-surface)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
                }}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    data-label={col.header}
                    style={{
                      padding: '0.875rem 1rem',
                      color: 'var(--text-primary)',
                      verticalAlign: 'middle',
                    }}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </>
  );
}
