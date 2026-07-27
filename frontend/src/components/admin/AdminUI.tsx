import { type CSSProperties, type ChangeEvent, type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

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
    <label
      className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3 text-sm transition focus-within:border-[var(--admin-accent)]"
      style={{
        borderRadius: 'var(--admin-radius)',
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        color: 'var(--text-muted)',
      }}
    >
      <Search size={16} aria-hidden="true" className="shrink-0" />
      <input
        value={value}
        onChange={onChange}
        onKeyDown={event => event.key === 'Enter' && onSubmit?.()}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none"
        style={{ color: 'var(--text-primary)' }}
      />
    </label>
  );
}

// --- AdminSelect -------------------------------------------------------------

export interface AdminSelectOption {
  value: string;
  label: string;
}

interface AdminSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: AdminSelectOption[];
  label: string;
  compact?: boolean;
  disabled?: boolean;
}

export function AdminSelect({ value, onValueChange, options, label, compact = false, disabled = false }: AdminSelectProps) {
  return (
    <div className={`admin-dropdown ${compact ? 'admin-dropdown-compact' : ''}`}>
      <select
        className="admin-dropdown-trigger"
        aria-label={label}
        disabled={disabled}
        value={value}
        onChange={event => onValueChange(event.target.value)}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
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
        <div className="mt-6 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className="admin-secondary-button">
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
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
  children,
}: {
  id?: string;
  title: string;
  description?: string;
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
      <div className="mb-5 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

// --- AdminRowActions ---------------------------------------------------------

export function AdminRowActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-1.5">{children}</div>;
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
        role="region"
        aria-label={caption}
        tabIndex={0}
        style={{ overflowX: 'auto' }}
      >
        <table
          className="admin-data-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.875rem',
            minWidth,
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
