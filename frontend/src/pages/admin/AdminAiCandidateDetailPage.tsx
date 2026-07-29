import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '@/layouts/AdminLayout';
import { AdminConfirmDialog, AdminPageHeader, AdminSelect, AdminStatusBadge } from '@/components/admin/AdminUI';
import { approveAiCandidate, createAiCandidateRevision, getAiCandidate, getAiCandidateAudit, getAiPublishTargets, publishAiCandidate, rejectAiCandidate, remapAiCandidateSources, searchAiCandidateSources, submitAiCandidate, updateAiCandidate } from '@/services/aiCandidateApi';
import type { AiCandidateAuditEvent, AiCandidateDetail, AiPublishTarget, AiSourceSearchResult } from '@/types/aiCandidate';
import { ApiRequestError } from '@/services/apiClient';
import { useAuth } from '@/auth/AuthContext';
import { hasPermission } from '@/auth/permissions';

function reviewError(cause: unknown) {
  if (cause instanceof ApiRequestError && cause.code === 'AI_CANDIDATE_VERSION_CONFLICT') {
    return 'Candidate đã được reviewer khác cập nhật. Hãy tải lại trước khi tiếp tục.';
  }
  if (cause instanceof ApiRequestError && cause.code === 'AI_REVISION_ALREADY_OPEN') return 'Câu hỏi này đã có một bản sửa đổi đang xử lý.';
  if (cause instanceof ApiRequestError && cause.code === 'AI_REVISION_HEAD_CONFLICT') return 'Bản official gốc không còn là revision hiện hành. Hãy tải lại trang.';
  if (cause instanceof ApiRequestError && cause.code === 'AI_REVISION_BASE_CHANGED') return 'Nội dung official nền đã thay đổi; bản sửa đổi không thể tiếp tục.';
  if (cause instanceof ApiRequestError && cause.code === 'AI_CANDIDATE_PROVENANCE_STALE') return 'Nguồn hiện tại không còn khớp corpus active. Hãy tìm và remap nguồn canonical rồi gửi duyệt lại.';
  return cause instanceof Error ? cause.message : 'Thao tác thất bại.';
}

export default function AdminAiCandidateDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [candidate, setCandidate] = useState<AiCandidateDetail | null>(null);
  const [audit, setAudit] = useState<AiCandidateAuditEvent[]>([]);
  const [targets, setTargets] = useState<AiPublishTarget[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [targetIndex, setTargetIndex] = useState(0);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [selfReviewOverride, setSelfReviewOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [revisionReason, setRevisionReason] = useState('');
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceResults, setSourceResults] = useState<AiSourceSearchResult[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [remapReason, setRemapReason] = useState('');
  const canPublish = hasPermission(currentUser, 'AI_CANDIDATE_PUBLISH');

  const load = useCallback(async () => {
    const [detail, events, publishTargets] = await Promise.all([getAiCandidate(id), getAiCandidateAudit(id), canPublish ? getAiPublishTargets() : Promise.resolve([])]);
    setCandidate(detail); setAudit(events); setTargets(publishTargets); setReviewNote(detail.reviewNote ?? '');
  }, [canPublish, id]);
  useEffect(() => { void load().catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể tải candidate.')); }, [load]);

  const editable = hasPermission(currentUser, 'AI_CANDIDATE_EDIT') && (candidate?.status === 'DRAFT' || candidate?.status === 'REJECTED');

  async function run(action: () => Promise<AiCandidateDetail>) {
    if (busy) return;
    setBusy(true); setError('');
    try { setCandidate(await action()); setAudit(await getAiCandidateAudit(id)); }
    catch (cause) { setError(reviewError(cause)); }
    finally { setBusy(false); }
  }

  if (!candidate) return <AdminLayout><p role={error ? 'alert' : 'status'}>{error || 'Đang tải câu hỏi AI...'}</p></AdminLayout>;
  const loadedCandidate = candidate;

  const canSubmit = hasPermission(currentUser, 'AI_CANDIDATE_SUBMIT');
  const canReview = hasPermission(currentUser, 'AI_CANDIDATE_REVIEW');
  const isCreator = currentUser?.id === candidate.createdBy;
  const canReviewNormally = canReview && !isCreator;
  const canUseOverride = canReview && isCreator && currentUser?.role === 'admin';
  const canCreateRevision = hasPermission(currentUser, 'AI_CANDIDATE_CREATE');
  const isRevision = candidate.revision?.originType === 'REVISION';
  const canRemap = editable && isRevision;
  const availableTargets = isRevision ? targets.filter(target =>
    target.datasetId === candidate.revision?.baseDatasetId && target.definitionId === candidate.revision?.baseDefinitionId
    && target.sectionId === candidate.revision?.baseSectionId) : targets;

  async function createRevision() {
    if (!revisionReason.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const revision = await createAiCandidateRevision(loadedCandidate.id, revisionReason);
      navigate(`/admin/exams/ai-candidates/${revision.id}`);
    } catch (cause) { setError(reviewError(cause)); }
    finally { setBusy(false); }
  }

  async function searchSources() {
    if (!sourceQuery.trim() || busy) return;
    setBusy(true); setError('');
    try {
      setSourceResults(await searchAiCandidateSources(loadedCandidate.id, {
        query: sourceQuery, grade: loadedCandidate.grade,
        ...(loadedCandidate.lessonNumber ? { lessonNumber: loadedCandidate.lessonNumber } : {}), topK: 10,
      }));
    } catch (cause) { setError(reviewError(cause)); }
    finally { setBusy(false); }
  }

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
        <div className="grid gap-3 sm:grid-cols-3"><AdminSelect visibleLabel label="Độ khó" value={candidate.difficulty} disabled={!editable} onValueChange={value => setCandidate({ ...candidate, difficulty: value })} options={['EASY', 'MEDIUM', 'HARD'].map(value => ({ value, label: value }))} /><label>Lớp<input className="admin-form-input" type="number" value={candidate.grade} disabled={!editable} onChange={event => setCandidate({ ...candidate, grade: Number(event.target.value) })} /></label><label>Bài<input className="admin-form-input" type="number" value={candidate.lessonNumber ?? ''} disabled={!editable} onChange={event => setCandidate({ ...candidate, lessonNumber: event.target.value ? Number(event.target.value) : null })} /></label></div>
        <label className="grid gap-1 text-sm font-semibold">Ghi chú review<textarea className="admin-form-input" value={reviewNote} disabled={!editable && candidate.status !== 'PENDING_REVIEW'} onChange={event => setReviewNote(event.target.value)} /></label>
        {editable && <button className="admin-primary-button" disabled={busy} onClick={() => void run(() => updateAiCandidate(candidate.id, { version: candidate.version, questionText: candidate.questionText, explanation: candidate.explanation, difficulty: candidate.difficulty, grade: candidate.grade, ...(candidate.lessonNumber ? { lessonNumber: candidate.lessonNumber } : {}), ...(candidate.topic ? { topic: candidate.topic } : {}), options: candidate.options.map(option => ({ id: option.id, text: option.text, correct: option.correct })), reviewNote }))}>Lưu chỉnh sửa</button>}
        <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
          {canSubmit && (candidate.status === 'DRAFT' || candidate.status === 'REJECTED') && <button className="admin-primary-button" disabled={busy} onClick={() => void run(() => submitAiCandidate(candidate.id, candidate.version, reviewNote))}>Gửi duyệt</button>}
          {candidate.status === 'PENDING_REVIEW' && canReviewNormally && <><button className="admin-primary-button" disabled={busy} onClick={() => void run(() => approveAiCandidate(candidate.id, candidate.version, reviewNote))}>Phê duyệt</button><input aria-label="Lý do từ chối" className="admin-form-input" value={rejectReason} onChange={event => setRejectReason(event.target.value)} placeholder="Lý do từ chối bắt buộc" /><button className="admin-text-button text-[var(--danger)]" disabled={busy || !rejectReason.trim()} onClick={() => void run(() => rejectAiCandidate(candidate.id, candidate.version, rejectReason))}>Từ chối</button></>}
          {candidate.status === 'PENDING_REVIEW' && canUseOverride && <div className="w-full space-y-2 rounded-lg border border-[var(--warning)] p-3"><label><input type="checkbox" checked={selfReviewOverride} onChange={event => setSelfReviewOverride(event.target.checked)} /> Dùng self-review override dành riêng cho admin</label><input aria-label="Lý do self-review override" className="admin-form-input" value={overrideReason} onChange={event => setOverrideReason(event.target.value)} placeholder="Lý do override bắt buộc" /><button className="admin-primary-button" disabled={busy || !selfReviewOverride || !overrideReason.trim()} onClick={() => void run(() => approveAiCandidate(candidate.id, candidate.version, reviewNote, true, overrideReason))}>Phê duyệt bằng override</button></div>}
          {candidate.status === 'APPROVED' && canPublish && <><AdminSelect label="Đích xuất bản" value={String(targetIndex)} onValueChange={value => setTargetIndex(Number(value))} options={availableTargets.map((target, index) => ({ value: String(index), label: target.label }))} /><button className="admin-primary-button" disabled={busy || availableTargets.length === 0} onClick={() => setConfirmPublish(true)}>Xuất bản tường minh</button></>}
          {candidate.status === 'PUBLISHED' && <p className="font-semibold text-[var(--success)]">Đã xuất bản: {candidate.officialQuestionId}</p>}
        </div>
        {candidate.status === 'PUBLISHED' && canCreateRevision && (candidate.revision?.openRevisionCandidateId
          ? <Link className="admin-primary-button inline-block" to={`/admin/exams/ai-candidates/${candidate.revision.openRevisionCandidateId}`}>Xem bản sửa đổi đang xử lý</Link>
          : <div className="space-y-2 rounded-lg border border-[var(--border)] p-3"><label className="grid gap-1 font-semibold">Lý do tạo bản sửa đổi<textarea className="admin-form-input" value={revisionReason} onChange={event => setRevisionReason(event.target.value)} /></label><button className="admin-primary-button" disabled={busy || !revisionReason.trim()} onClick={() => void createRevision()}>Tạo bản sửa đổi</button></div>)}
        {canRemap && <section className="space-y-3 rounded-lg border border-[var(--border)] p-3"><h3 className="font-bold">Tìm và remap nguồn canonical</h3><div className="flex gap-2"><input aria-label="Truy vấn tìm nguồn" className="admin-form-input flex-1" value={sourceQuery} onChange={event => setSourceQuery(event.target.value)} /><button className="admin-text-button" disabled={busy || !sourceQuery.trim()} onClick={() => void searchSources()}>Tìm nguồn</button></div>{sourceResults.map(result => <label key={result.chunkId} className="block rounded border border-[var(--border)] p-2"><input type="checkbox" checked={selectedSources.includes(result.chunkId)} onChange={event => setSelectedSources(current => event.target.checked ? [...current, result.chunkId] : current.filter(value => value !== result.chunkId))} /> <strong>{result.lessonTitle} · {result.sectionTitle}</strong><span className="ml-2 text-xs">distance {result.distance.toFixed(4)}</span><p className="mt-1 whitespace-pre-wrap text-sm">{result.excerpt}</p></label>)}{sourceResults.length > 0 && <><textarea aria-label="Lý do remap nguồn" className="admin-form-input" value={remapReason} onChange={event => setRemapReason(event.target.value)} /><button className="admin-primary-button" disabled={busy || !remapReason.trim() || selectedSources.length === 0} onClick={() => void run(() => remapAiCandidateSources(candidate.id, candidate.version, sourceResults.filter(result => selectedSources.includes(result.chunkId)).map(result => ({ chunkId: result.chunkId, chunkHash: result.chunkHash })), remapReason))}>Remap nguồn đã chọn</button></>}</section>}
      </section>

      <aside className="space-y-4">
        {isRevision && candidate.revision && <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="font-bold">So sánh với official nền · revision {candidate.revision.revisionNumber}</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{candidate.revision.revisionReason}</p>
          <dl className="mt-3 grid gap-2 text-sm"><dt>Base official ID</dt><dd className="technical-text break-all text-xs">{candidate.revision.baseOfficialQuestionId}</dd><dt>Câu hỏi nền</dt><dd className="whitespace-pre-wrap">{candidate.revision.baseQuestionText}</dd><dt>Giải thích nền</dt><dd className="whitespace-pre-wrap">{candidate.revision.baseExplanation}</dd><dt>Độ khó / chủ đề</dt><dd>{candidate.revision.baseDifficulty} · {candidate.revision.baseTopic ?? '—'}</dd><dt>Content hash nền</dt><dd className="technical-text break-all text-xs">{candidate.revision.baseContentHash}</dd></dl>
          <ol className="mt-3 space-y-1 text-sm">{candidate.revision.baseOptions.map(option => <li key={option.id}><strong>{option.id}{option.correct ? ' ✓' : ''}</strong> {option.text}</li>)}</ol>
          <h3 className="mt-4 font-semibold">Nguồn của phiên bản gốc</h3>{candidate.revision.baseSources.map(source => <p key={source.chunkId} className="mt-1 break-all text-xs">{source.lessonTitle} · {source.sectionTitle} · {source.chunkId}</p>)}
        </section>}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="font-bold">Nội dung AI ban đầu</h2><p className="mt-3 whitespace-pre-wrap">{candidate.originalQuestionText}</p><p className="mt-3 text-sm text-[var(--text-muted)]">Đáp án gốc: {candidate.originalCorrectOptionId}</p><p className="mt-2 whitespace-pre-wrap text-sm">{candidate.originalExplanation}</p></section>
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="font-bold">Provenance</h2><dl className="mt-3 grid gap-2 text-sm"><dt>Model sinh</dt><dd>{candidate.generationModel}</dd><dt>Embedding</dt><dd>{candidate.embeddingModel} · {candidate.embeddingDimension}</dd><dt>Prompt/schema</dt><dd>{candidate.promptVersion} · {candidate.schemaVersion}</dd><dt>Corpus SHA</dt><dd className="technical-text break-all">{candidate.corpusSha256}</dd><dt>Collection</dt><dd>{candidate.collectionName}</dd><dt>Tạo lúc</dt><dd>{new Date(candidate.createdAt).toLocaleString('vi-VN')}</dd></dl><p className="mt-3 text-xs text-[var(--text-muted)]">Provenance hỗ trợ đối chiếu, không chứng minh nội dung chắc chắn đúng.</p></section>
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="font-bold">Nguồn ({candidate.sources.length})</h2>{candidate.sources.map(source => <article key={source.chunkId} className="mt-3 border-t border-[var(--border)] pt-3 text-sm"><strong>{source.lessonTitle ?? source.documentId ?? 'Nguồn SGK'}</strong><p>{source.sectionTitle}{source.pageStart ? ` · Trang ${source.pageStart}${source.pageEnd && source.pageEnd !== source.pageStart ? `–${source.pageEnd}` : ''}` : ''}</p><code className="break-all text-xs">{source.chunkId}</code></article>)}</section>
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="font-bold">Cảnh báo</h2>{candidate.generationWarnings.length ? candidate.generationWarnings.map(warning => <p key={warning} className="mt-2 text-sm">Cần đối chiếu thủ công · {warning}</p>) : <p className="mt-2 text-sm">Không có cảnh báo kỹ thuật.</p>}</section>
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="font-bold">Audit timeline</h2><ol className="mt-3 space-y-3">{audit.map(event => <li key={event.id} className="border-l-2 border-[var(--admin-accent)] pl-3 text-sm"><strong>{event.eventType}</strong><p>{event.fromStatus ?? '—'} → {event.toStatus ?? '—'}</p><time className="text-xs text-[var(--text-muted)]">{new Date(event.createdAt).toLocaleString('vi-VN')}</time>{event.note && <p>{event.note}</p>}</li>)}</ol></section>
      </aside>
    </div>
    <AdminConfirmDialog open={confirmPublish} title="Xuất bản câu hỏi AI?" description={isRevision ? 'Hành động này tạo một official question mới và giữ nguyên mọi official revision trước.' : 'Hành động này tạo câu hỏi official trong definition ẩn, yêu cầu review. Candidate sẽ bất biến sau publish.'} confirmLabel="Xuất bản" onCancel={() => setConfirmPublish(false)} onConfirm={() => { const target = availableTargets[targetIndex]; setConfirmPublish(false); if (target) void run(() => publishAiCandidate(candidate.id, candidate.version, target)); }} />
  </AdminLayout>;
}
