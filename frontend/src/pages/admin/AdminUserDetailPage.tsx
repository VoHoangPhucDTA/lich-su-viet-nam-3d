import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import AdminLayout from '../../layouts/AdminLayout';
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminPageHeader,
  AdminStatusBadge,
} from '../../components/admin/AdminUI';
import {
  getAdminUserDetail,
  type AdminUserActivityItem,
  type AdminUserDetail,
  type AdminUserRole,
} from '../../services/adminApi';
import { ApiRequestError } from '../../services/apiClient';
import { safeAdminUsersReturnLocation } from './adminUserNavigation';

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-1 text-sm leading-6 text-[var(--text-primary)]">{children || '—'}</dd>
    </div>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('vi-VN') : 'Chưa ghi nhận';
}

function score(value: number | null) {
  return value == null ? 'Chưa có điểm' : `${value.toFixed(2)}/10`;
}

function activityKind(item: AdminUserActivityItem) {
  if (item.kind === 'event_view') return 'Xem sự kiện';
  if (item.kind === 'quiz_submitted') return 'Nộp bài kiểm tra';
  return 'Nộp bài thi';
}

function roleLabel(role: AdminUserRole) {
  return role === 'admin' ? 'Quản trị' : role === 'teacher' ? 'Giáo viên' : 'Học sinh';
}

function errorMessage(cause: unknown) {
  if (cause instanceof ApiRequestError) {
    if (cause.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    if (cause.status === 403) return 'Bạn không có quyền xem dữ liệu quản trị này.';
    if (cause.status === 404) return 'Không tìm thấy tài khoản người dùng.';
    return cause.message;
  }
  return cause instanceof Error ? cause.message : 'Không thể tải chi tiết người dùng.';
}

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const returnTo = safeAdminUsersReturnLocation(location.state);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      if (!id) {
        setLoading(false);
        setError('ID người dùng không hợp lệ.');
        return;
      }
      setLoading(true);
      setError('');
      try {
        setDetail(await getAdminUserDetail(id, controller.signal));
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
    <AdminLayout title="Chi tiết người dùng">
      <div className="mb-4">
        <Link to={returnTo} className="admin-text-button no-underline">← Quay lại danh sách</Link>
      </div>

      {loading && <AdminLoadingState label="Đang tải chi tiết người dùng…" />}
      {!loading && error && <AdminErrorState message={error} onRetry={() => setRetry(value => value + 1)} />}
      {!loading && !error && !detail && <AdminEmptyState title="Không có dữ liệu người dùng" />}
      {!loading && !error && detail && (
        <>
          <AdminPageHeader
            eyebrow="Chi tiết quản trị · Chỉ đọc"
            title={detail.account.displayName ?? detail.account.email}
            description={detail.account.displayName
              ? detail.account.email
              : 'Tên hiển thị chưa được ghi nhận; tiêu đề đang dùng email làm fallback trực quan.'}
            actions={<AdminStatusBadge status={detail.account.status} label={detail.account.status === 'deleted' ? 'Đã xóa (trạng thái DB)' : undefined} />}
          />

          <div className="grid gap-5 xl:grid-cols-2">
            <DetailSection title="Tài khoản">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="ID">{detail.account.id}</Field>
                <Field label="Tên hiển thị">{detail.account.displayName ?? 'Chưa ghi nhận'}</Field>
                <Field label="Email">{detail.account.email}</Field>
                <Field label="Quyền chính">{detail.account.primaryRole ? roleLabel(detail.account.primaryRole) : 'Chưa có quyền'}</Field>
                <Field label="Tất cả quyền">{detail.account.roles.length ? detail.account.roles.map(roleLabel).join(', ') : 'Chưa có quyền'}</Field>
                <Field label="Khối lớp">{detail.account.grade ?? 'Chưa ghi nhận'}</Field>
                <Field label="Trường">{detail.account.school ?? 'Chưa ghi nhận'}</Field>
                <Field label="Ngày tạo">{formatDate(detail.account.createdAt)}</Field>
                <Field label="Cập nhật">{formatDate(detail.account.updatedAt)}</Field>
                <Field label="Avatar">
                  {detail.account.avatarUrl
                    ? <a href={detail.account.avatarUrl} target="_blank" rel="noreferrer">URL avatar an toàn</a>
                    : 'Không có URL an toàn'}
                </Field>
              </dl>
            </DetailSection>

            <DetailSection title="Xác thực và phiên">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Xác thực email">{detail.account.emailVerified ? 'Đã ghi nhận' : 'Chưa ghi nhận'}</Field>
                <Field label="Thời điểm xác thực">{formatDate(detail.account.emailVerifiedAt)}</Field>
                <Field label="Cơ chế phiên">{detail.sessions.trackingMode}</Field>
                <Field label="Phiên refresh đang hoạt động">Không thể thống kê</Field>
              </dl>
              <p role="note" className="mt-4 rounded-lg bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-muted)]">
                Hệ thống dùng JWT stateless và chưa lưu bảng phiên xác thực. Giá trị phiên không được suy diễn thành 0.
              </p>
            </DetailSection>

            <DetailSection title="Tổng hợp học tập">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Lượt xem đã lưu">{detail.learning.progress.eventsViewed}</Field>
                <Field label="Sự kiện khác nhau">{detail.learning.progress.distinctEventsViewed}</Field>
                <Field label="Tổng phút học">{detail.learning.progress.totalMinutes}</Field>
                <Field label="Hoạt động tiến độ cuối">{formatDate(detail.learning.progress.lastActivityAt)}</Field>
                <Field label="Hoạt động học có ý nghĩa cuối">{formatDate(detail.activity.lastMeaningfulActivityAt)}</Field>
                <Field label="Bài kiểm tra đã nộp">{detail.learning.quizzes.submittedCount}</Field>
                <Field label="Điểm kiểm tra trung bình">{score(detail.learning.quizzes.averageScore10)}</Field>
                <Field label="Nộp bài kiểm tra cuối">{formatDate(detail.learning.quizzes.lastSubmittedAt)}</Field>
                <Field label="Bài thi hiện hành đã nộp">{detail.learning.exams.submittedCount}</Field>
                <Field label="Điểm thi trung bình">{score(detail.learning.exams.averageScore10)}</Field>
                <Field label="Nộp bài thi cuối">{formatDate(detail.learning.exams.lastSubmittedAt)}</Field>
              </dl>
            </DetailSection>

            <DetailSection title="Hoạt động học gần đây">
              {detail.activity.recent.length === 0 ? (
                <AdminEmptyState title="Chưa có hoạt động học" description="Không có lượt xem, bài kiểm tra hoặc bài thi đã nộp." />
              ) : (
                <ul className="space-y-2">
                  {detail.activity.recent.map((item, index) => (
                    <li key={`${item.kind}-${item.timestamp}-${index}`} className="rounded-lg bg-[var(--bg-surface)] px-3 py-2 text-sm">
                      <strong>{activityKind(item)}</strong>
                      <span className="ml-2">{item.title}</span>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {formatDate(item.timestamp)}{item.score10 == null ? '' : ` · ${score(item.score10)}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            <DetailSection title="Audit quản trị gần đây">
              {detail.recentAdminAudit.length === 0 ? (
                <AdminEmptyState title="Chưa có audit liên quan" description="Không có thao tác quản trị an toàn để hiển thị." />
              ) : (
                <ul className="space-y-2">
                  {detail.recentAdminAudit.map((entry, index) => (
                    <li key={`${entry.timestamp}-${entry.action ?? 'audit'}-${index}`} className="rounded-lg bg-[var(--bg-surface)] px-3 py-2 text-sm">
                      <strong>{entry.action ?? 'Thao tác quản trị'}</strong>
                      <span className="ml-2 text-[var(--text-muted)]">{entry.actor.displayName} · {entry.relation}</span>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {entry.entityType ?? 'entity'} · {entry.entityId ?? '—'} · {formatDate(entry.timestamp)}
                      </p>
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
