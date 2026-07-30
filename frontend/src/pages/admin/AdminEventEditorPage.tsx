import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../layouts/AdminLayout';
import {
  AdminCheckbox,
  AdminConfirmDialog,
  AdminErrorState,
  AdminField,
  AdminFormSection,
  AdminPageHeader,
  AdminSelect,
  AdminStatusBadge,
  AdminTextArea,
} from '../../components/admin/AdminUI';
import {
  createAdminEvent,
  getAdminEventDetail,
  replaceAdminEventGrades,
  updateAdminEventCore,
  type AdminEventDetail,
  type AdminEventCreateRequest,
  type AdminEventCorePatchRequest,
} from '../../services/adminApi';
import { ApiRequestError } from '../../services/apiClient';
import AdminEventMediaSection from '../../components/admin/AdminEventMediaSection';
import AdminEventGeographySection from '../../components/admin/AdminEventGeographySection';
import AdminEventPublicationActions from '../../components/admin/AdminEventPublicationActions';
import {
  publicationIssueTargetId,
  publishedEventMutationError,
} from '../../components/admin/adminEventPublication';

type CoreForm = {
  title: string;
  slug: string;
  shortTitle: string;
  eventLevel: 'atomic' | 'collection';
  eventType: 'military' | 'political' | 'economic' | 'cultural';
  eventSubtype: string;
  startYear: string;
  endYear: string;
  effectiveEndYear: string;
  displayDate: string;
  datePrecision: string;
  cardSummary: string;
  canonicalSummary: string;
  detailedNarrative: string;
  significance: string;
  keyFacts: string;
  showOnHomepage: boolean;
  showOnTimeline: boolean;
  featured: boolean;
};

const emptyForm: CoreForm = {
  title: '', slug: '', shortTitle: '', eventLevel: 'atomic', eventType: 'political',
  eventSubtype: '', startYear: '', endYear: '', effectiveEndYear: '', displayDate: '',
  datePrecision: '', cardSummary: '', canonicalSummary: '', detailedNarrative: '',
  significance: '', keyFacts: '', showOnHomepage: false, showOnTimeline: false, featured: false,
};

function fromDetail(detail: AdminEventDetail): CoreForm {
  const chronology = detail.chronology;
  return {
    title: detail.core.title,
    slug: detail.core.slug,
    shortTitle: detail.core.shortTitle ?? '',
    eventLevel: detail.classification.eventLevel,
    eventType: detail.classification.eventType,
    eventSubtype: detail.classification.eventSubtype ?? '',
    startYear: chronology.startYear == null ? '' : String(chronology.startYear),
    endYear: chronology.endYear == null ? '' : String(chronology.endYear),
    effectiveEndYear: chronology.effectiveEndYear == null ? '' : String(chronology.effectiveEndYear),
    displayDate: chronology.displayDate ?? '',
    datePrecision: chronology.datePrecision ?? '',
    cardSummary: detail.content.cardSummary ?? '',
    canonicalSummary: detail.content.canonicalSummary ?? '',
    detailedNarrative: detail.content.detailedNarrative ?? '',
    significance: detail.content.significance ?? '',
    keyFacts: detail.content.keyFacts.join('\n'),
    ...detail.publication.flags,
  };
}

function toNullableNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

function Field({ label, value, onChange, required = false, type = 'text', error }: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; error?: string;
}) {
  return (
    <AdminField
      label={label}
      required={required}
      error={error}
      type={type}
      value={value}
      onChange={event => onChange(event.target.value)}
    />
  );
}

function TextArea({ label, value, onChange, rows = 4 }: {
  label: string; value: string; onChange: (value: string) => void; rows?: number;
}) {
  return (
    <AdminTextArea
      label={label}
      value={value}
      onChange={event => onChange(event.target.value)}
      rows={rows}
    />
  );
}

function SectionState({
  dirty,
  saving,
  success,
  error,
}: {
  dirty: boolean;
  saving: boolean;
  success?: string;
  error?: string;
}) {
  if (saving) return <AdminStatusBadge status="pending" label="Đang lưu" />;
  if (error) return <AdminStatusBadge status="disabled" label="Có lỗi" />;
  if (success) return <AdminStatusBadge status="active" label="Đã lưu" />;
  if (dirty) return <AdminStatusBadge status="draft" label="Chưa lưu" />;
  return <AdminStatusBadge status="active" label="Đã đồng bộ" />;
}

function errorMessage(error: unknown): string {
  const publishedMutationMessage = publishedEventMutationError(error);
  if (publishedMutationMessage) return publishedMutationMessage;
  if (error instanceof ApiRequestError && error.code === 'EVENT_UPDATE_CONFLICT') {
    return 'Sự kiện đã được thay đổi ở nơi khác. Hãy tải lại để xem phiên bản mới trước khi lưu.';
  }
  return error instanceof Error ? error.message : 'Không thể hoàn tất thao tác.';
}

export default function AdminEventEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const editing = Boolean(id);
  const returnTo = typeof location.state === 'object'
    && location.state !== null
    && 'from' in location.state
    && typeof location.state.from === 'string'
    && location.state.from.startsWith('/admin/events')
    ? location.state.from
    : '/admin/events';
  const [detail, setDetail] = useState<AdminEventDetail | null>(null);
  const [form, setForm] = useState<CoreForm>(emptyForm);
  const [grades, setGrades] = useState<number[]>([]);
  const [version, setVersion] = useState('');
  const [loading, setLoading] = useState(editing);
  const [coreSaving, setCoreSaving] = useState(false);
  const [gradeSaving, setGradeSaving] = useState(false);
  const [mediaSaving, setMediaSaving] = useState(false);
  const [geographySaving, setGeographySaving] = useState(false);
  const [publicationSaving, setPublicationSaving] = useState(false);
  const [coreError, setCoreError] = useState('');
  const [gradeError, setGradeError] = useState('');
  const [coreSuccess, setCoreSuccess] = useState('');
  const [gradeSuccess, setGradeSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [coreDirty, setCoreDirty] = useState(!editing);
  const [gradeDirty, setGradeDirty] = useState(!editing);
  const [geographyDirty, setGeographyDirty] = useState(false);
  const [mediaDirty, setMediaDirty] = useState(false);
  const [conflict, setConflict] = useState('');
  const [confirmConflictReload, setConfirmConflictReload] = useState(false);
  const allowSuccessfulCreateNavigation = useRef(false);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    getAdminEventDetail(id, controller.signal).then(value => {
      setDetail(value);
      setForm(fromDetail(value));
      setGrades(value.classification.grades);
      setVersion(value.publication.updatedAt);
      setCoreDirty(false);
      setGradeDirty(false);
    }).catch(error => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setCoreError(errorMessage(error));
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (coreDirty || gradeDirty || mediaDirty || geographyDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [coreDirty, gradeDirty, mediaDirty, geographyDirty]);

  useEffect(() => {
    if (!detail || !location.hash.startsWith('#admin-event-')) return;
    const timer = window.setTimeout(() => {
      document.getElementById(location.hash.slice(1))
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [detail, location.hash]);

  const facts = useMemo(() => form.keyFacts.split('\n').map(value => value.trim()).filter(Boolean), [form.keyFacts]);
  const update = <K extends keyof CoreForm>(key: K, value: CoreForm[K]) => {
    setForm(previous => ({ ...previous, [key]: value }));
    setCoreDirty(true);
    setCoreSuccess('');
  };
  const mutationSaving = coreSaving || gradeSaving || mediaSaving
    || geographySaving || publicationSaving;
  const mutableSectionDirty = coreDirty || gradeDirty || mediaDirty || geographyDirty;
  const blocker = useBlocker(
    () => mutableSectionDirty && !allowSuccessfulCreateNavigation.current,
  );
  const mutationsBlocked = mutationSaving || Boolean(conflict);
  const markConflict = (message?: string) => {
    setConflict(message
      ?? 'Sự kiện đã thay đổi ở nơi khác. Các thao tác lưu đã bị khóa để tránh ghi đè dữ liệu.');
  };

  const saveCore = async (event: FormEvent) => {
    event.preventDefault();
    if (mutationsBlocked) return;
    setCoreSaving(true);
    setCoreError('');
    setCoreSuccess('');
    setFieldErrors({});
    try {
      if (!editing) {
        const payload: AdminEventCreateRequest = {
          title: form.title, slug: form.slug, shortTitle: form.shortTitle || null,
          eventLevel: form.eventLevel, eventType: form.eventType, eventSubtype: form.eventSubtype || null,
          startYear: toNullableNumber(form.startYear), endYear: toNullableNumber(form.endYear),
          effectiveEndYear: toNullableNumber(form.effectiveEndYear), displayDate: form.displayDate || null,
          datePrecision: form.datePrecision || null, cardSummary: form.cardSummary || null,
          canonicalSummary: form.canonicalSummary || null, detailedNarrative: form.detailedNarrative || null,
          significance: form.significance || null, keyFacts: facts, grades,
          showOnHomepage: form.showOnHomepage, showOnTimeline: form.showOnTimeline, featured: form.featured,
        };
        const created = await createAdminEvent(payload);
        setCoreDirty(false);
        setGradeDirty(false);
        allowSuccessfulCreateNavigation.current = true;
        navigate(`/admin/events/${created.core.id}/edit`, {
          replace: true,
          state: { from: returnTo },
        });
        return;
      }
      const payload: AdminEventCorePatchRequest = { expectedUpdatedAt: version };
      const fields: Array<keyof CoreForm> = [
        'title', 'slug', 'shortTitle', 'eventLevel', 'eventType', 'eventSubtype',
        'startYear', 'endYear', 'effectiveEndYear', 'displayDate', 'datePrecision',
        'cardSummary', 'canonicalSummary', 'detailedNarrative', 'significance',
        'showOnHomepage', 'showOnTimeline', 'featured',
      ];
      fields.forEach(field => {
        const value = form[field];
        (payload as unknown as Record<string, unknown>)[field] = typeof value === 'string'
          ? (['startYear', 'endYear', 'effectiveEndYear'].includes(field) ? toNullableNumber(value) : value || null)
          : value;
      });
      payload.keyFacts = facts;
      const updated = await updateAdminEventCore(id!, payload);
      setDetail(updated);
      setVersion(updated.publication.updatedAt);
      setCoreDirty(false);
      setCoreSuccess('Đã lưu nội dung.');
    } catch (error) {
      if (error instanceof ApiRequestError && error.violations.length) {
        setFieldErrors(Object.fromEntries(error.violations.map(item => [item.field, item.message])));
      }
      if (error instanceof ApiRequestError && error.code === 'EVENT_UPDATE_CONFLICT') {
        markConflict();
      } else {
        setCoreError(errorMessage(error));
      }
    } finally {
      setCoreSaving(false);
    }
  };

  const saveGrades = async () => {
    if (!id || mutationsBlocked) return;
    setGradeSaving(true);
    setGradeError('');
    setGradeSuccess('');
    try {
      const updated = await replaceAdminEventGrades(id, { expectedUpdatedAt: version, grades });
      setDetail(updated);
      setVersion(updated.publication.updatedAt);
      setGrades(updated.classification.grades);
      setGradeDirty(false);
      setGradeSuccess('Đã lưu khối lớp.');
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'EVENT_UPDATE_CONFLICT') {
        markConflict();
      } else {
        setGradeError(errorMessage(error));
      }
    } finally {
      setGradeSaving(false);
    }
  };

  const reload = () => window.location.reload();
  if (loading) return <AdminLayout title="Chỉnh sửa sự kiện"><div role="status" aria-live="polite" className="flex min-h-48 items-center justify-center text-sm text-[var(--text-muted)]">Đang tải sự kiện…</div></AdminLayout>;
  if (coreError && editing && !detail) return <AdminLayout title="Chỉnh sửa sự kiện"><AdminErrorState message={coreError} onRetry={reload} /></AdminLayout>;

  return (
    <AdminLayout title={editing ? 'Chỉnh sửa sự kiện' : 'Tạo sự kiện'}>
      <div className="mb-4"><Link to={returnTo} className="text-xs font-semibold text-[var(--text-muted)]">← Quay lại danh sách</Link></div>
      <AdminPageHeader title={editing ? 'Chỉnh sửa sự kiện' : 'Tạo bản nháp sự kiện'} description="Chỉnh sửa nội dung lõi, khối lớp, media metadata và dữ liệu địa lý có cấu trúc." />
      {editing && detail && <AdminFormSection
        id="admin-event-publication"
        title="Xuất bản"
        description={`Trạng thái hiện tại: ${detail.publication.status}`}
        status={<SectionState dirty={false} saving={publicationSaving} />}
      >
        <AdminEventPublicationActions
          eventId={id!}
          status={detail.publication.status}
          version={version}
          disabled={mutationsBlocked || mutableSectionDirty}
          disabledReason={mutableSectionDirty
            ? 'Hãy lưu hoặc hủy mọi thay đổi ở nội dung, khối lớp, media và địa lý trước khi đổi trạng thái.'
            : undefined}
          onBusyChange={setPublicationSaving}
          onUpdated={updated => {
            setDetail(updated);
            setVersion(updated.publication.updatedAt);
          }}
          onReload={markConflict}
          onIssueSelect={issue => document
            .getElementById(publicationIssueTargetId(issue.section))
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
      </AdminFormSection>}
      {conflict && (
        <div role="alert" className="mb-4 rounded-lg border border-[var(--accent)]/20 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--accent)]">
          {conflict}
          <button type="button" onClick={() => setConfirmConflictReload(true)} className="ml-2 underline">
            Tải dữ liệu mới nhất
          </button>
        </div>
      )}
      {coreError && <div role="alert" className="mb-4 rounded-lg border border-[var(--accent)]/20 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--accent)]">{coreError}</div>}
      <form onSubmit={saveCore} className="space-y-5">
        <AdminFormSection id="admin-event-classification" title="Định danh và phân loại" status={<SectionState dirty={coreDirty} saving={coreSaving} success={coreSuccess} error={coreError} />}><div className="grid gap-4 md:grid-cols-2">
          <Field label="Tên sự kiện" value={form.title} onChange={value => update('title', value)} required error={fieldErrors.title} />
          <Field label="Slug" value={form.slug} onChange={value => update('slug', value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'))} required error={fieldErrors.slug} />
          <Field label="Tên ngắn" value={form.shortTitle} onChange={value => update('shortTitle', value)} />
          <AdminSelect visibleLabel label="Cấp độ" value={form.eventLevel} onValueChange={value => update('eventLevel', value as CoreForm['eventLevel'])} options={[{ value: 'atomic', label: 'Sự kiện đơn' }, { value: 'collection', label: 'Bộ sưu tập' }]} />
          <AdminSelect visibleLabel label="Loại" value={form.eventType} onValueChange={value => update('eventType', value as CoreForm['eventType'])} options={[{ value: 'political', label: 'Chính trị' }, { value: 'military', label: 'Quân sự' }, { value: 'economic', label: 'Kinh tế' }, { value: 'cultural', label: 'Văn hóa' }]} />
          <Field label="Phân loại phụ" value={form.eventSubtype} onChange={value => update('eventSubtype', value)} />
        </div></AdminFormSection>
        <AdminFormSection id="admin-event-chronology" title="Thời gian" status={<SectionState dirty={coreDirty} saving={coreSaving} success={coreSuccess} error={coreError} />}><div className="grid gap-4 md:grid-cols-3">
          <Field label="Năm bắt đầu" value={form.startYear} onChange={value => update('startYear', value)} type="number" />
          <Field label="Năm kết thúc" value={form.endYear} onChange={value => update('endYear', value)} type="number" />
          <Field label="Năm kết thúc hiệu lực" value={form.effectiveEndYear} onChange={value => update('effectiveEndYear', value)} type="number" />
          <Field label="Ngày hiển thị" value={form.displayDate} onChange={value => update('displayDate', value)} />
          <Field label="Độ chính xác" value={form.datePrecision} onChange={value => update('datePrecision', value)} />
        </div></AdminFormSection>
        <AdminFormSection id="admin-event-content" title="Nội dung" description="Nội dung lịch sử và các dữ kiện chính." status={<SectionState dirty={coreDirty} saving={coreSaving} success={coreSuccess} error={coreError} />}><div className="space-y-4">
          <TextArea label="Tóm tắt thẻ" value={form.cardSummary} onChange={value => update('cardSummary', value)} rows={3} />
          <TextArea label="Tóm tắt chính" value={form.canonicalSummary} onChange={value => update('canonicalSummary', value)} />
          <TextArea label="Nội dung chi tiết" value={form.detailedNarrative} onChange={value => update('detailedNarrative', value)} rows={8} />
          <TextArea label="Ý nghĩa lịch sử" value={form.significance} onChange={value => update('significance', value)} />
          <TextArea label="Key facts, mỗi dòng một ý" value={form.keyFacts} onChange={value => update('keyFacts', value)} />
        </div></AdminFormSection>
        <AdminFormSection title="Cờ hiển thị" status={<SectionState dirty={coreDirty} saving={coreSaving} success={coreSuccess} error={coreError} />}><div className="flex flex-wrap gap-5 text-sm text-[var(--text-secondary)]">
          {(['showOnHomepage', 'showOnTimeline', 'featured'] as const).map(key => <AdminCheckbox key={key} label={key} checked={form[key]} onChange={event => update(key, event.target.checked)} />)}
        </div></AdminFormSection>
        <div className="flex items-center justify-between"><span role="status" aria-live="polite" className="text-xs text-[var(--text-muted)]">{coreSuccess}</span><button type="submit" disabled={mutationsBlocked || !coreDirty} className="admin-primary-button disabled:cursor-not-allowed disabled:opacity-50">{coreSaving ? 'Đang lưu…' : 'Lưu nội dung'}</button></div>
      </form>
      <AdminFormSection title="Khối lớp" description={editing ? 'Thay thế toàn bộ danh sách trong một request độc lập.' : 'Khối lớp được tạo cùng bản nháp trong một transaction.'} status={<SectionState dirty={gradeDirty} saving={gradeSaving} success={gradeSuccess} error={gradeError} />}>
        <div className="flex flex-wrap gap-5 text-sm text-[var(--text-secondary)]">{[10, 11, 12].map(grade => <AdminCheckbox key={grade} label={`Lớp ${grade}`} checked={grades.includes(grade)} onChange={event => { setGrades(previous => event.target.checked ? [...previous, grade].sort() : previous.filter(value => value !== grade)); setGradeDirty(true); setGradeSuccess(''); }} />)}</div>
        {gradeError && <p role="alert" className="mt-3 text-sm text-[var(--accent)]">{gradeError}</p>}
        {editing && <div className="mt-4 flex items-center justify-between"><span role="status" aria-live="polite" className="text-xs text-[var(--text-muted)]">{gradeSuccess}</span><button type="button" disabled={mutationsBlocked || !gradeDirty} onClick={saveGrades} className="admin-primary-button disabled:cursor-not-allowed disabled:opacity-50">{gradeSaving ? 'Đang lưu…' : 'Lưu khối lớp'}</button></div>}
      </AdminFormSection>
      {editing && detail && <div className="mt-5 space-y-5">
        <AdminEventMediaSection
          eventId={id!}
          detail={detail}
          version={version}
          disabled={mutationsBlocked}
          onBusyChange={setMediaSaving}
          onDirtyChange={setMediaDirty}
          onUpdated={updated => { setDetail(updated); setVersion(updated.publication.updatedAt); }}
          onConflict={markConflict}
        />
        <AdminEventGeographySection
          eventId={id!}
          detail={detail}
          version={version}
          disabled={mutationsBlocked}
          onBusyChange={setGeographySaving}
          onDirtyChange={setGeographyDirty}
          onUpdated={updated => { setDetail(updated); setVersion(updated.publication.updatedAt); }}
          onConflict={markConflict}
        />
        <AdminFormSection title="Dữ liệu chỉ đọc"><p className="text-sm text-[var(--text-secondary)]">Hierarchy và nguồn vẫn chỉ đọc. Không có trình sửa raw JSON, GeoJSON hay công cụ vẽ Cesium.</p><p className="mt-2 text-xs text-[var(--text-muted)]">Phiên bản hiện tại: {version}</p></AdminFormSection>
      </div>}
      <AdminConfirmDialog
        open={blocker.state === 'blocked'}
        title="Rời trang khi chưa lưu?"
        description="Các thay đổi chưa lưu sẽ bị mất."
        confirmLabel="Rời trang"
        danger
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
      <AdminConfirmDialog
        open={confirmConflictReload}
        title="Tải dữ liệu mới nhất?"
        description="Mọi giá trị chưa lưu trên trang sẽ bị mất. Hệ thống sẽ không tự động gửi lại thao tác trước đó."
        confirmLabel="Tải lại"
        danger
        onConfirm={reload}
        onCancel={() => setConfirmConflictReload(false)}
      />
    </AdminLayout>
  );
}
