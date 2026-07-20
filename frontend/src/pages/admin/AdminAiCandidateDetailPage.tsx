import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AdminLayout from '@/layouts/AdminLayout';
import { AdminConfirmDialog, AdminPageHeader, AdminStatusBadge } from '@/components/admin/AdminUI';
import { approveAiCandidate, getAiCandidate, getAiCandidateAudit, getAiPublishTargets, publishAiCandidate, rejectAiCandidate, submitAiCandidate, updateAiCandidate } from '@/services/aiCandidateApi';
import type { AiCandidateAuditEvent, AiCandidateDetail, AiPublishTarget } from '@/types/aiCandidate';
import { ApiRequestError } from '@/services/apiClient';

function reviewError(cause: unknown) {
  if (cause instanceof ApiRequestError && cause.code === 'AI_CANDIDATE_VERSION_CONFLICT') {
    return 'Candidate đã được reviewer khác cập nhật. Hãy tải lại trước khi tiếp tục.';
  }
  return cause instanceof Error ? cause.message : 'Thao tác thất bại.';
}

export default function AdminAiCandidateDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const [candidate, setCandidate] = useState<AiCandidateDetail | null>(null);
  const [audit, setAudit] = useState<AiCandidateAuditEvent[]>([]);
  const [targets, setTargets] = useState<AiPublishTarget[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [targetIndex, setTargetIndex] = useState(0);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const load = useCallback(async () => {
    const [detail, events, publishTargets] = await Promise.all([getAiCandidate(id), getAiCandidateAudit(id), getAiPublishTargets()]);
    setCandidate(detail); setAudit(events); setTargets(publishTargets); setReviewNote(detail.reviewNote ?? '');
  }, [id]);
  useEffect(() => { void load().catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể tải candidate.')); }, [load]);

  const editable = candidate?.status === 'DRAFT' || candidate?.status === 'REJECTED';

  async function run(action: () => Promise<AiCandidateDetail>) {
    if (busy) return;
    setBusy(true); setError('');
    try { setCandidate(await action()); setAudit(await getAiCandidateAudit(id)); }
    catch (cause) { setError(reviewError(cause)); }
    finally { setBusy(false); }
  }

  if (!candidate) return <AdminLayout><p role={error ? 'alert' : 'status'}>{error || 'Đang tải câu hỏi AI...'}</p></AdminLayout>;

  return <AdminLayout>
    <AdminPageHeader title="Chi tiết câu hỏi AI" description="Nguồn và thông tin sinh giúp admin đối chiếu nội dung trước khi xuất bản." actions={<Link to="/admin/exams/ai-candidates" className="admin-text-button">← Hàng chờ</Link>} />
    {error && <p role="alert" className="mb-4 rounded-lg border border-[var(--danger)] p-3 text-[var(--danger)]">{error}</p>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
      <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="font-bold">Nội dung hiện tại</h2><AdminStatusBadge status={candidate.status.toLowerCase()} label={candidate.status} /></div>
        <label className="grid gap-1 text-sm font-semibold">Câu hỏi<textarea className="admin-form-input min-h-28" value={candidate.questionText} disabled={!editable} onChange={event => setCandidate({ ...candidate, questionText: event.target.value })} /></label>
        <div className="space-y-2" role="radiogroup" aria-label="Đáp án đúng">
          {candidate.options.map((option, index) => <div key={option.id} className="flex gap-2"><input aria-label={`Đáp án đúng ${option.id}`} type="radio" name="correct" checked={option.correct} disabled={!editable} onChange={() => setCandidate({ ...candidate, options: candidate.options.map(item => ({ ...item, correct: item.id === option.id })) })} /><span className="w-6 font-bold">{option.id}</span><input className="admin-form-input flex-1" value={option.text} disabled={!editable} onChange={event => setCandidate({ ...candidate, options: candidate.options.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item) })} /></div>)}
        </div>
        <label className="grid gap-1 text-sm font-semibold">Giải thích<textarea className="admin-form-input min-h-28" value={candidate.explanation} disabled={!editable} onChange={event => setCandidate({ ...candidate, explanation: event.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-3"><label>Độ khó<select className="admin-form-input" value={candidate.difficulty} disabled={!editable} onChange={event => setCandidate({ ...candidate, difficulty: event.target.value })}>{['EASY', 'MEDIUM', 'HARD'].map(value => <option key={value}>{value}</option>)}</select></label><label>Lớp<input className="admin-form-input" type="number" value={candidate.grade} disabled={!editable} onChange={event => setCandidate({ ...candidate, grade: Number(event.target.value) })} /></label><label>Bài<input className="admin-form-input" type="number" value={candidate.lessonNumber ?? ''} disabled={!editable} onChange={event => setCandidate({ ...candidate, lessonNumber: event.target.value ? Number(event.target.value) : null })} /></label></div>
        <label className="grid gap-1 text-sm font-semibold">Ghi chú review<textarea className="admin-form-input" value={reviewNote} disabled={!editable && candidate.status !== 'PENDING_REVIEW'} onChange={event => setReviewNote(event.target.value)} /></label>
        {editable && <button className="admin-primary-button" disabled={busy} onClick={() => void run(() => updateAiCandidate(candidate.id, { version: candidate.version, questionText: candidate.questionText, explanation: candidate.explanation, difficulty: candidate.difficulty, grade: candidate.grade, ...(candidate.lessonNumber ? { lessonNumber: candidate.lessonNumber } : {}), ...(candidate.topic ? { topic: candidate.topic } : {}), options: candidate.options.map(option => ({ id: option.id, text: option.text, correct: option.correct })), reviewNote }))}>Lưu chỉnh sửa</button>}
        <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
          {(candidate.status === 'DRAFT' || candidate.status === 'REJECTED') && <button className="admin-primary-button" disabled={busy} onClick={() => void run(() => submitAiCandidate(candidate.id, candidate.version, reviewNote))}>Gửi duyệt</button>}
          {candidate.status === 'PENDING_REVIEW' && <><button className="admin-primary-button" disabled={busy} onClick={() => void run(() => approveAiCandidate(candidate.id, candidate.version, reviewNote))}>Phê duyệt</button><input aria-label="Lý do từ chối" className="admin-form-input" value={rejectReason} onChange={event => setRejectReason(event.target.value)} placeholder="Lý do từ chối bắt buộc" /><button className="admin-text-button text-[var(--danger)]" disabled={busy || !rejectReason.trim()} onClick={() => void run(() => rejectAiCandidate(candidate.id, candidate.version, rejectReason))}>Từ chối</button></>}
          {candidate.status === 'APPROVED' && <><select aria-label="Đích xuất bản" className="admin-form-input" value={targetIndex} onChange={event => setTargetIndex(Number(event.target.value))}>{targets.map((target, index) => <option key={target.sectionId} value={index}>{target.label}</option>)}</select><button className="admin-primary-button" disabled={busy || targets.length === 0} onClick={() => setConfirmPublish(true)}>Xuất bản tường minh</button></>}
          {candidate.status === 'PUBLISHED' && <p className="font-semibold text-[var(--success)]">Đã xuất bản: {candidate.officialQuestionId}</p>}
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="font-bold">Nội dung AI ban đầu</h2><p className="mt-3 whitespace-pre-wrap">{candidate.originalQuestionText}</p><p className="mt-3 text-sm text-[var(--text-muted)]">Đáp án gốc: {candidate.originalCorrectOptionId}</p><p className="mt-2 whitespace-pre-wrap text-sm">{candidate.originalExplanation}</p></section>
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="font-bold">Provenance</h2><dl className="mt-3 grid gap-2 text-sm"><dt>Model sinh</dt><dd>{candidate.generationModel}</dd><dt>Embedding</dt><dd>{candidate.embeddingModel} · {candidate.embeddingDimension}</dd><dt>Prompt/schema</dt><dd>{candidate.promptVersion} · {candidate.schemaVersion}</dd><dt>Corpus SHA</dt><dd className="break-all font-mono">{candidate.corpusSha256}</dd><dt>Collection</dt><dd>{candidate.collectionName}</dd><dt>Tạo lúc</dt><dd>{new Date(candidate.createdAt).toLocaleString('vi-VN')}</dd></dl><p className="mt-3 text-xs text-[var(--text-muted)]">Provenance hỗ trợ đối chiếu, không chứng minh nội dung chắc chắn đúng.</p></section>
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="font-bold">Nguồn ({candidate.sources.length})</h2>{candidate.sources.map(source => <article key={source.chunkId} className="mt-3 border-t border-[var(--border)] pt-3 text-sm"><strong>{source.lessonTitle ?? source.documentId ?? 'Nguồn SGK'}</strong><p>{source.sectionTitle}{source.pageStart ? ` · Trang ${source.pageStart}${source.pageEnd && source.pageEnd !== source.pageStart ? `–${source.pageEnd}` : ''}` : ''}</p><code className="break-all text-xs">{source.chunkId}</code></article>)}</section>
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="font-bold">Cảnh báo</h2>{candidate.generationWarnings.length ? candidate.generationWarnings.map(warning => <p key={warning} className="mt-2 text-sm">Cần đối chiếu thủ công · {warning}</p>) : <p className="mt-2 text-sm">Không có cảnh báo kỹ thuật.</p>}</section>
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="font-bold">Audit timeline</h2><ol className="mt-3 space-y-3">{audit.map(event => <li key={event.id} className="border-l-2 border-[var(--admin-accent)] pl-3 text-sm"><strong>{event.eventType}</strong><p>{event.fromStatus ?? '—'} → {event.toStatus ?? '—'}</p><time className="text-xs text-[var(--text-muted)]">{new Date(event.createdAt).toLocaleString('vi-VN')}</time>{event.note && <p>{event.note}</p>}</li>)}</ol></section>
      </aside>
    </div>
    <AdminConfirmDialog open={confirmPublish} title="Xuất bản câu hỏi AI?" description="Hành động này tạo câu hỏi official trong definition ẩn, yêu cầu review. Candidate sẽ bất biến sau publish." confirmLabel="Xuất bản" onCancel={() => setConfirmPublish(false)} onConfirm={() => { const target = targets[targetIndex]; setConfirmPublish(false); if (target) void run(() => publishAiCandidate(candidate.id, candidate.version, target)); }} />
  </AdminLayout>;
}
