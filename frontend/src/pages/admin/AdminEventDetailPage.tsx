import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import AdminLayout from '../../layouts/AdminLayout';
import {
  AdminErrorState,
  AdminLoadingState,
  AdminPageHeader,
  AdminStatusBadge,
} from '../../components/admin/AdminUI';
import { getAdminEventDetail, type AdminEventDetail } from '../../services/adminApi';
import { ApiRequestError } from '../../services/apiClient';
import { formatChronologyLabel } from '../../utils/chronology';
import AdminEventPublicationActions from '../../components/admin/AdminEventPublicationActions';
import { publicationIssueTargetId } from '../../components/admin/adminEventPublication';

function DetailSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{children || '—'}</dd>
    </div>
  );
}

function errorMessage(cause: unknown) {
  if (cause instanceof ApiRequestError) {
    if (cause.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    if (cause.status === 403) return 'Bạn không có quyền xem dữ liệu quản trị này.';
    if (cause.status === 404) return 'Không tìm thấy sự kiện.';
    return cause.message;
  }
  return cause instanceof Error ? cause.message : 'Không thể tải chi tiết sự kiện.';
}

export default function AdminEventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [event, setEvent] = useState<AdminEventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const returnTo = typeof location.state === 'object'
    && location.state !== null
    && 'from' in location.state
    && typeof location.state.from === 'string'
    && location.state.from.startsWith('/admin/events')
    ? location.state.from
    : '/admin/events';

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError('');
      try {
        setEvent(await getAdminEventDetail(id, controller.signal));
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(errorMessage(cause));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [id, retry]);

  return (
    <AdminLayout title="Chi tiết sự kiện">
      <div className="mb-4">
        <Link to={returnTo} className="admin-text-button no-underline">← Quay lại danh sách</Link>
      </div>
      {loading && <AdminLoadingState label="Đang tải chi tiết sự kiện…" />}
      {!loading && error && <AdminErrorState message={error} onRetry={() => setRetry(value => value + 1)} />}
      {!loading && !error && event && (
        <>
          <AdminPageHeader
            eyebrow="Chi tiết quản trị"
            title={event.core.title}
            description={`ID: ${event.core.id} · Cập nhật ${new Date(event.publication.updatedAt).toLocaleString('vi-VN')}`}
            actions={(
              <>
                <AdminStatusBadge status={event.publication.status} />
                <Link
                  to={`/admin/events/${encodeURIComponent(event.core.id)}/edit`}
                  state={{ from: returnTo }}
                  className="admin-primary-button no-underline"
                >
                  Chỉnh sửa
                </Link>
              </>
            )}
          />
          <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <AdminEventPublicationActions
              eventId={event.core.id}
              status={event.publication.status}
              version={event.publication.updatedAt}
              onUpdated={setEvent}
              onReload={() => setRetry(value => value + 1)}
              onIssueSelect={issue => document
                .getElementById(publicationIssueTargetId(issue.section))
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            />
          </div>
          <p role="note" className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            Hard delete vẫn bị khóa. Nội dung aggregate chỉ thay đổi qua các workflow typed riêng.
          </p>

          <div className="grid gap-5 xl:grid-cols-2">
            <DetailSection id="admin-event-classification" title="Thông tin cốt lõi">
              <dl id="admin-event-chronology" className="grid gap-4 sm:grid-cols-2">
                <Field label="Slug">{event.core.slug}</Field>
                <Field label="Tên ngắn">{event.core.shortTitle}</Field>
                <Field label="Niên đại">{formatChronologyLabel(event.chronology)}</Field>
                <Field label="Độ chính xác">{event.chronology.datePrecision}</Field>
                <Field label="Cấp độ">{event.classification.eventLevel}</Field>
                <Field label="Loại">{event.classification.eventType}</Field>
                <Field label="Loại phụ">{event.classification.eventSubtype}</Field>
                <Field label="Khối lớp">{event.classification.grades.length ? event.classification.grades.join(', ') : 'Chưa gán'}</Field>
              </dl>
            </DetailSection>

            <DetailSection id="admin-event-completeness" title="Chẩn đoán độ đầy đủ">
              {event.completeness.complete ? (
                <AdminStatusBadge status="active" label="Dữ liệu đầy đủ" />
              ) : (
                <ul className="space-y-2">
                  {event.completeness.issues.map(issue => (
                    <li key={issue.code} className="rounded-lg bg-[var(--bg-surface)] px-3 py-2 text-sm">
                      <strong>{issue.code}</strong>
                      <span className="ml-2 text-[var(--text-muted)]">{issue.section} · {issue.fields.join(', ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            <DetailSection id="admin-event-content" title="Nội dung">
              <dl className="space-y-4">
                <Field label="Tóm tắt thẻ">{event.content.cardSummary}</Field>
                <Field label="Tóm tắt chuẩn">{event.content.canonicalSummary}</Field>
                <Field label="Tường thuật chi tiết">{event.content.detailedNarrative}</Field>
                <Field label="Ý nghĩa">{event.content.significance}</Field>
                <Field label="Sự kiện chính">{event.content.keyFacts.length ? event.content.keyFacts.join('\n') : 'Chưa có'}</Field>
              </dl>
            </DetailSection>

            <DetailSection title="Xuất bản">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Trạng thái">{event.publication.status}</Field>
                <Field label="Xuất bản lúc">{event.publication.publishedAt ? new Date(event.publication.publishedAt).toLocaleString('vi-VN') : 'Chưa xuất bản'}</Field>
                <Field label="Trang chủ">{event.publication.flags.showOnHomepage ? 'Có' : 'Không'}</Field>
                <Field label="Timeline">{event.publication.flags.showOnTimeline ? 'Có' : 'Không'}</Field>
                <Field label="Nổi bật">{event.publication.flags.featured ? 'Có' : 'Không'}</Field>
                <Field label="Ngày tạo">{new Date(event.publication.createdAt).toLocaleString('vi-VN')}</Field>
              </dl>
            </DetailSection>

            <DetailSection id="admin-event-media" title="Ảnh đại diện và media">
              {event.media.thumbnail && (
                <img
                  src={event.media.thumbnail.url}
                  alt={event.media.thumbnail.altText ?? ''}
                  className="mb-4 max-h-56 w-full rounded-lg object-cover"
                />
              )}
              <p className="mb-3 text-sm text-[var(--text-secondary)]">{event.media.activeCount} media đang hoạt động</p>
              {event.media.items.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Chưa có media an toàn để hiển thị.</p> : (
                <ul className="space-y-2">
                  {event.media.items.map(item => (
                    <li key={item.id} className="rounded-lg bg-[var(--bg-surface)] px-3 py-2 text-sm">
                      {item.urlSafe !== false && item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer" className="font-semibold text-[var(--admin-accent)]">
                          {item.caption || item.altText || `${item.mediaType} #${item.id}`}
                        </a>
                      ) : (
                        <span className="font-semibold text-[var(--text-muted)]">URL không an toàn đã ẩn</span>
                      )}
                      <span className="ml-2 text-[var(--text-muted)]">{item.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            <DetailSection id="admin-event-geography" title="Địa lý và dữ liệu bản đồ">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Geo type lưu trữ">{event.geography.normalizedGeoType}</Field>
                <Field label="Geo type chuẩn">{event.geography.canonicalGeoType}</Field>
                <Field label="Tọa độ">{event.geography.lat != null && event.geography.lng != null ? `${event.geography.lat}, ${event.geography.lng}` : 'Không có'}</Field>
                <Field label="Tỉnh/thành">{event.geography.provinceNames.join(', ')}</Field>
                <Field label="Địa danh lịch sử">{event.geography.historicalLocations.join(', ')}</Field>
                <Field label="Map data">{event.geography.mapData ? `${event.geography.mapData.markers.length} marker · ${event.geography.mapData.gadmRefs.length} GADM ref` : 'Không có hoặc không hợp lệ'}</Field>
              </dl>
            </DetailSection>

            <DetailSection title="Phân cấp và quan hệ">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Cha">{event.hierarchy.parent?.title}</Field>
                <Field label="Gốc">{event.hierarchy.root?.title}</Field>
                <Field label="Sự kiện con">{event.hierarchy.children.map(item => item.title).join(', ')}</Field>
                <Field label="Quan hệ">{event.hierarchy.relations.map(item => `${item.associationType}: ${item.event.title}`).join(', ')}</Field>
              </dl>
            </DetailSection>

            <DetailSection title="Tham chiếu giáo khoa">
              <p className="mb-3 text-sm text-[var(--text-secondary)]">
                {event.textbook.visibleReferenceCount}/{event.textbook.totalReferenceCount} tham chiếu hiển thị ·
                nội dung giáo khoa: {event.textbook.hasTextbookContent ? 'có' : 'không'}
              </p>
              <ul className="space-y-2">
                {event.textbook.visibleReferences.map(reference => (
                  <li key={reference.id} className="rounded-lg bg-[var(--bg-surface)] px-3 py-2 text-sm">
                    Lớp {reference.grade} · {[reference.book, reference.lesson].filter(Boolean).join(' · ')}
                    {reference.pageStart != null && <span> · trang {reference.pageStart}{reference.pageEnd != null ? `–${reference.pageEnd}` : ''}</span>}
                  </li>
                ))}
              </ul>
            </DetailSection>

            <DetailSection title="Nguồn ngoài an toàn">
              {event.externalSources.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Không có nguồn ngoài công khai.</p> : (
                <ul className="space-y-2">
                  {event.externalSources.map(source => (
                    <li key={`${source.canonicalUri}-${source.sourceOrder}`}>
                      <a href={source.canonicalUri} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[var(--admin-accent)]">
                        {source.title || source.canonicalUri}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
