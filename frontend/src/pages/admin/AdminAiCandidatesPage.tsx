import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/layouts/AdminLayout';
import { AdminDataTable, AdminFilterSelect, AdminPageHeader, AdminPagination, AdminSearchInput, AdminStatusBadge, type AdminDataColumn } from '@/components/admin/AdminUI';
import { listAiCandidates } from '@/services/aiCandidateApi';
import type { AiCandidateSummary } from '@/types/aiCandidate';

const LIMIT = 20;

export default function AdminAiCandidatesPage() {
  const [items, setItems] = useState<AiCandidateSummary[]>([]);
  const [status, setStatus] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const result = await listAiCandidates({ status: status || undefined, difficulty: difficulty || undefined, q: appliedQuery || undefined, limit: LIMIT, offset }, signal);
      setItems(result.items); setTotal(result.total);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Không thể tải hàng chờ câu hỏi AI.');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [appliedQuery, difficulty, offset, status]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const columns: AdminDataColumn<AiCandidateSummary>[] = [
    { key: 'question', header: 'Câu hỏi', render: item => <div className="min-w-72"><Link className="font-semibold text-[var(--admin-accent)]" to={`/admin/exams/ai-candidates/${item.id}`}>{item.questionText}</Link><p className="mt-1 text-xs text-[var(--text-muted)]">Lớp {item.grade}{item.lessonNumber ? ` · Bài ${item.lessonNumber}` : ''}</p></div> },
    { key: 'status', header: 'Trạng thái', render: item => <AdminStatusBadge status={item.status.toLowerCase()} label={item.status} /> },
    { key: 'difficulty', header: 'Độ khó', render: item => <span>{item.difficulty}<small className="block text-[var(--text-muted)]">{item.topic ?? 'Chưa gắn chủ đề'}</small></span> },
    { key: 'people', header: 'Người xử lý', render: item => <span className="text-xs">Tạo: {item.createdBy}<br />Duyệt: {item.reviewedBy ?? '—'}</span> },
    { key: 'provenance', header: 'Đối chiếu', render: item => <span className="text-xs">{item.sourceCount} nguồn · {item.warningCount} cảnh báo</span> },
    { key: 'created', header: 'Tạo lúc', render: item => <time className="text-xs" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('vi-VN')}</time> },
  ];

  return <AdminLayout>
    <AdminPageHeader title="Duyệt câu hỏi AI" description="Đối chiếu provenance, chỉnh sửa, phê duyệt và xuất bản tường minh. Không có câu nào được tự động xuất bản." />
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--admin-shadow)]">
      <div className="space-y-3 border-b border-[var(--border)] p-4">
        <AdminSearchInput value={query} onChange={event => setQuery(event.target.value)} onSubmit={() => { setOffset(0); setAppliedQuery(query.trim()); }} placeholder="Tìm nội dung câu hỏi..." />
        <div className="flex flex-wrap gap-2">
          <AdminFilterSelect label="Trạng thái" value={status} onValueChange={value => { setStatus(value); setOffset(0); }} options={[{ value: '', label: 'Tất cả trạng thái' }, ...['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED'].map(value => ({ value, label: value }))]} />
          <AdminFilterSelect label="Độ khó" value={difficulty} onValueChange={value => { setDifficulty(value); setOffset(0); }} options={[{ value: '', label: 'Tất cả độ khó' }, ...['EASY', 'MEDIUM', 'HARD'].map(value => ({ value, label: value }))]} />
        </div>
      </div>
      <AdminDataTable columns={columns} rows={items} getKey={item => item.id} minWidth="850px" loading={loading} error={error || undefined} onRetry={() => void load()} emptyTitle="Chưa có câu hỏi AI" emptyDescription="Admin có thể tạo quiz AI và chọn câu để lưu dưới dạng nháp." footer={<AdminPagination total={total} offset={offset} limit={LIMIT} loading={loading} onChange={setOffset} />} />
    </section>
  </AdminLayout>;
}
