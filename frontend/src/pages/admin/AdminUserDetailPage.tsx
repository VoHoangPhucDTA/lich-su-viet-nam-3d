import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import AdminLayout from '../../layouts/AdminLayout';
import {
  AdminEmptyState,
  AdminConfirmDialog,
  AdminErrorState,
  AdminLoadingState,
  AdminPageHeader,
  AdminStatusBadge,
} from '../../components/admin/AdminUI';
import {
  getAdminUserDetail,
  replaceAdminUserRoles,
  updateAdminUserStatus,
  type AdminUserActivityItem,
  type AdminUserDetail,
  type AdminUserRole,
  type AdminUserStatus,
} from '../../services/adminApi';
import { ApiRequestError } from '../../services/apiClient';
import { useAuth } from '../../auth/AuthContext';
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

type Confirmation =
  | { kind: 'roles'; roles: AdminUserRole[]; danger: boolean }
  | { kind: 'status'; status: Exclude<AdminUserStatus, 'deleted'>; danger: boolean };

const canonicalRoles: AdminUserRole[] = ['admin', 'teacher', 'student'];

function nextStatuses(status: AdminUserStatus): Array<Exclude<AdminUserStatus, 'deleted'>> {
  if (status === 'active') return ['disabled'];
  if (status === 'pending') return ['active', 'disabled'];
  if (status === 'disabled') return ['active', 'pending'];
  return [];
}

function statusActionLabel(status: Exclude<AdminUserStatus, 'deleted'>) {
  if (status === 'active') return 'Kích hoạt';
  if (status === 'pending') return 'Chuyển về chờ xác thực';
  return 'Vô hiệu hóa';
}

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { currentUser } = useAuth();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<AdminUserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const [mutationSuccess, setMutationSuccess] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const mutationController = useRef<AbortController | null>(null);
  const returnTo = safeAdminUsersReturnLocation(location.state);

  useEffect(() => () => mutationController.current?.abort(), []);

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
        const loaded = await getAdminUserDetail(id, controller.signal);
        setDetail(loaded);
        setSelectedRoles(loaded.account.roles);
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

  const applyDetail = (updated: AdminUserDetail, message: string) => {
    setDetail(updated);
    setSelectedRoles(updated.account.roles);
    setMutationSuccess(message);
  };

  const handleMutationError = (cause: unknown) => {
    if (cause instanceof DOMException && cause.name === 'AbortError') return;
    if (cause instanceof ApiRequestError && cause.code === 'USER_UPDATE_CONFLICT') {
      setMutationError('Tài khoản đã thay đổi ở nơi khác. Dữ liệu mới đang được tải lại; hãy kiểm tra trước khi tiếp tục.');
      setRetry(value => value + 1);
      return;
    }
    setMutationError(errorMessage(cause));
  };

  const executeConfirmation = async () => {
    if (!detail || !id || !confirmation || mutating) return;
    const action = confirmation;
    setConfirmation(null);
    setMutating(true);
    setMutationError('');
    setMutationSuccess('');
    const controller = new AbortController();
    mutationController.current = controller;
    try {
      if (action.kind === 'roles') {
        const updated = await replaceAdminUserRoles(id, {
          expectedUpdatedAt: detail.account.updatedAt,
          roles: action.roles,
        }, controller.signal);
        applyDetail(updated, 'Đã cập nhật quyền và vô hiệu hóa các thông tin xác thực cũ.');
      } else {
        const updated = await updateAdminUserStatus(id, {
          expectedUpdatedAt: detail.account.updatedAt,
          status: action.status,
        }, controller.signal);
        applyDetail(updated, 'Đã cập nhật trạng thái và vô hiệu hóa các thông tin xác thực cũ.');
      }
    } catch (cause) {
      handleMutationError(cause);
    } finally {
      mutationController.current = null;
      setMutating(false);
    }
  };

  const toggleRole = (role: AdminUserRole) => {
    if (mutating) return;
    setSelectedRoles(current => current.includes(role)
      ? current.filter(value => value !== role)
      : canonicalRoles.filter(value => value === role || current.includes(value)));
  };

  const canMutate = detail != null
    && currentUser != null
    && detail.account.status !== 'deleted'
    && currentUser.id !== detail.account.id;
  const roleChanged = detail != null
    && canonicalRoles.some(role => selectedRoles.includes(role) !== detail.account.roles.includes(role));
  const roleReduction = detail != null
    && detail.account.roles.some(role => !selectedRoles.includes(role));

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
                <Field label="Xác thực email">{detail.account.emailVerified ? 'Đã ghi nhận' : 'Chưa ghi nhận'}</Field>
                <Field label="Thời điểm xác thực">{formatDate(detail.account.emailVerifiedAt)}</Field>
              </dl>
            </DetailSection>

            {canMutate && (
              <DetailSection title="Quản lý quyền và trạng thái">
                <div className="space-y-5">
                  <fieldset disabled={mutating}>
                    <legend className="text-sm font-semibold text-[var(--text-primary)]">
                      Gán quyền đầy đủ
                    </legend>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Lưu sẽ thay thế toàn bộ tập quyền hiện tại của người dùng.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-4">
                      {canonicalRoles.map(role => (
                        <label key={role} className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedRoles.includes(role)}
                            onChange={() => toggleRole(role)}
                          />
                          {roleLabel(role)}
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      className={`${roleReduction ? 'admin-danger-button' : 'admin-primary-button'} mt-4 disabled:cursor-not-allowed disabled:opacity-50`}
                      disabled={mutating || !roleChanged || selectedRoles.length === 0}
                      onClick={() => setConfirmation({
                        kind: 'roles',
                        roles: [...selectedRoles],
                        danger: roleReduction,
                      })}
                    >
                      {mutating ? 'Đang xử lý…' : 'Lưu tập quyền'}
                    </button>
                    {selectedRoles.length === 0 && (
                      <p role="alert" className="mt-2 text-xs text-[var(--accent)]">
                        Phải chọn ít nhất một quyền.
                      </p>
                    )}
                  </fieldset>

                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      Chuyển trạng thái
                    </h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {nextStatuses(detail.account.status).map(status => (
                        <button
                          key={status}
                          type="button"
                          disabled={mutating}
                          className={`${status === 'disabled' ? 'admin-danger-button' : 'admin-secondary-button'} disabled:cursor-not-allowed disabled:opacity-50`}
                          onClick={() => setConfirmation({
                            kind: 'status',
                            status,
                            danger: status === 'disabled',
                          })}
                        >
                          {statusActionLabel(status)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {mutationError && (
                    <p role="alert" className="rounded-lg border border-[var(--accent)]/20 bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent)]">
                      {mutationError}
                    </p>
                  )}
                  {mutationSuccess && (
                    <p role="status" className="rounded-lg border border-green-600/20 bg-green-600/10 p-3 text-sm text-green-700">
                      {mutationSuccess}
                    </p>
                  )}
                </div>
              </DetailSection>
            )}

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
          <AdminConfirmDialog
            open={confirmation !== null}
            title={confirmation?.kind === 'roles'
              ? 'Xác nhận thay thế tập quyền?'
              : `Xác nhận ${confirmation ? statusActionLabel(confirmation.status).toLowerCase() : ''} tài khoản?`}
            description={confirmation?.kind === 'roles'
              ? 'Thao tác thay thế toàn bộ quyền đã gán và làm mất hiệu lực mọi access/refresh token hiện có.'
              : 'Thao tác thay đổi trạng thái và làm mất hiệu lực mọi access/refresh token hiện có.'}
            confirmLabel="Xác nhận"
            danger={confirmation?.danger ?? false}
            onCancel={() => setConfirmation(null)}
            onConfirm={() => void executeConfirmation()}
          />
        </>
      )}
    </AdminLayout>
  );
}
