import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../layouts/AdminLayout';
import { AdminErrorState, AdminFormSection, AdminPageHeader } from '../../components/admin/AdminUI';
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

const fieldClass = 'mt-1.5 min-h-11 w-full rounded-[var(--admin-radius)] border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--admin-accent)]';

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
    <label className="block text-sm font-semibold text-[var(--text-secondary)]">
      {label}{required && <span className="ml-1 text-[var(--accent)]">*</span>}
      <input required={required} type={type} value={value} onChange={event => onChange(event.target.value)} className={fieldClass} />
      {error && <span className="mt-1 block text-xs text-[var(--accent)]">{error}</span>}
    </label>
  );
}

function TextArea({ label, value, onChange, rows = 4 }: {
  label: string; value: string; onChange: (value: string) => void; rows?: number;
}) {
  return (
    <label className="block text-sm font-semibold text-[var(--text-secondary)]">
      {label}
      <textarea value={value} onChange={event => onChange(event.target.value)} rows={rows} className={`${fieldClass} resize-y py-3`} />
    </label>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.code === 'EVENT_UPDATE_CONFLICT') {
    return 'Sự kiện đã được thay đổi ở nơi khác. Hãy tải lại để xem phiên bản mới trước khi lưu.';
  }
  return error instanceof Error ? error.message : 'Không thể hoàn tất thao tác.';
}

export default function AdminEventEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);
  const [detail, setDetail] = useState<AdminEventDetail | null>(null);
  const [form, setForm] = useState<CoreForm>(emptyForm);
  const [grades, setGrades] = useState<number[]>([]);
  const [version, setVersion] = useState('');
  const [loading, setLoading] = useState(editing);
  const [coreSaving, setCoreSaving] = useState(false);
  const [gradeSaving, setGradeSaving] = useState(false);
  const [coreError, setCoreError] = useState('');
  const [gradeError, setGradeError] = useState('');
  const [coreSuccess, setCoreSuccess] = useState('');
  const [gradeSuccess, setGradeSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [coreDirty, setCoreDirty] = useState(!editing);
  const [gradeDirty, setGradeDirty] = useState(!editing);

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
      if (coreDirty || gradeDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [coreDirty, gradeDirty]);

  const facts = useMemo(() => form.keyFacts.split('\n').map(value => value.trim()).filter(Boolean), [form.keyFacts]);
  const update = <K extends keyof CoreForm>(key: K, value: CoreForm[K]) => {
    setForm(previous => ({ ...previous, [key]: value }));
    setCoreDirty(true);
    setCoreSuccess('');
  };
  const mutationSaving = coreSaving || gradeSaving;

  const saveCore = async (event: FormEvent) => {
    event.preventDefault();
    if (mutationSaving) return;
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
        navigate(`/admin/events/${created.core.id}/edit`, { replace: true });
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
      setCoreError(errorMessage(error));
    } finally {
      setCoreSaving(false);
    }
  };

  const saveGrades = async () => {
    if (!id || mutationSaving) return;
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
      setGradeError(errorMessage(error));
    } finally {
      setGradeSaving(false);
    }
  };

  const reload = () => window.location.reload();
  const confirmLeave = (event: MouseEvent<HTMLAnchorElement>) => {
    if ((coreDirty || gradeDirty) && !window.confirm('Bạn có thay đổi chưa lưu. Rời trang?')) {
      event.preventDefault();
    }
  };
  if (loading) return <AdminLayout title="Chỉnh sửa sự kiện"><div className="flex min-h-48 items-center justify-center text-sm text-[var(--text-muted)]">Đang tải sự kiện…</div></AdminLayout>;
  if (coreError && editing && !detail) return <AdminLayout title="Chỉnh sửa sự kiện"><AdminErrorState message={coreError} onRetry={reload} /></AdminLayout>;

  return (
    <AdminLayout title={editing ? 'Chỉnh sửa sự kiện' : 'Tạo sự kiện'}>
      <div className="mb-4"><Link to="/admin/events" onClick={confirmLeave} className="text-xs font-semibold text-[var(--text-muted)]">← Quay lại danh sách</Link></div>
      <AdminPageHeader title={editing ? 'Chỉnh sửa sự kiện' : 'Tạo bản nháp sự kiện'} description="Chỉ nội dung lõi, khối lớp và cờ hiển thị có thể chỉnh sửa trong Phase 5." />
      {coreError && <div className="mb-4 rounded-lg border border-[var(--accent)]/20 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--accent)]">{coreError} {coreError.includes('thay đổi') && <button type="button" onClick={reload} className="ml-2 underline">Tải lại</button>}</div>}
      <form onSubmit={saveCore} className="space-y-5">
        <AdminFormSection title="Định danh và phân loại"><div className="grid gap-4 md:grid-cols-2">
          <Field label="Tên sự kiện" value={form.title} onChange={value => update('title', value)} required error={fieldErrors.title} />
          <Field label="Slug" value={form.slug} onChange={value => update('slug', value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'))} required error={fieldErrors.slug} />
          <Field label="Tên ngắn" value={form.shortTitle} onChange={value => update('shortTitle', value)} />
          <label className="text-sm font-semibold text-[var(--text-secondary)]">Cấp độ<select value={form.eventLevel} onChange={event => update('eventLevel', event.target.value as CoreForm['eventLevel'])} className={fieldClass}><option value="atomic">Sự kiện đơn</option><option value="collection">Bộ sưu tập</option></select></label>
          <label className="text-sm font-semibold text-[var(--text-secondary)]">Loại<select value={form.eventType} onChange={event => update('eventType', event.target.value as CoreForm['eventType'])} className={fieldClass}><option value="political">Chính trị</option><option value="military">Quân sự</option><option value="economic">Kinh tế</option><option value="cultural">Văn hóa</option></select></label>
          <Field label="Phân loại phụ" value={form.eventSubtype} onChange={value => update('eventSubtype', value)} />
        </div></AdminFormSection>
        <AdminFormSection title="Thời gian"><div className="grid gap-4 md:grid-cols-3">
          <Field label="Năm bắt đầu" value={form.startYear} onChange={value => update('startYear', value)} type="number" />
          <Field label="Năm kết thúc" value={form.endYear} onChange={value => update('endYear', value)} type="number" />
          <Field label="Năm kết thúc hiệu lực" value={form.effectiveEndYear} onChange={value => update('effectiveEndYear', value)} type="number" />
          <Field label="Ngày hiển thị" value={form.displayDate} onChange={value => update('displayDate', value)} />
          <Field label="Độ chính xác" value={form.datePrecision} onChange={value => update('datePrecision', value)} />
        </div></AdminFormSection>
        <AdminFormSection title="Nội dung lịch sử"><div className="space-y-4">
          <TextArea label="Tóm tắt thẻ" value={form.cardSummary} onChange={value => update('cardSummary', value)} rows={3} />
          <TextArea label="Tóm tắt chính" value={form.canonicalSummary} onChange={value => update('canonicalSummary', value)} />
          <TextArea label="Nội dung chi tiết" value={form.detailedNarrative} onChange={value => update('detailedNarrative', value)} rows={8} />
          <TextArea label="Ý nghĩa lịch sử" value={form.significance} onChange={value => update('significance', value)} />
          <TextArea label="Key facts, mỗi dòng một ý" value={form.keyFacts} onChange={value => update('keyFacts', value)} />
        </div></AdminFormSection>
        <AdminFormSection title="Cờ hiển thị"><div className="flex flex-wrap gap-5 text-sm text-[var(--text-secondary)]">
          {(['showOnHomepage', 'showOnTimeline', 'featured'] as const).map(key => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={form[key]} onChange={event => update(key, event.target.checked)} />{key}</label>)}
        </div></AdminFormSection>
        <div className="flex items-center justify-between"><span className="text-xs text-[var(--text-muted)]">{coreSuccess}</span><button type="submit" disabled={mutationSaving || !coreDirty} className="admin-primary-button disabled:cursor-not-allowed disabled:opacity-50">{coreSaving ? 'Đang lưu…' : 'Lưu nội dung'}</button></div>
      </form>
      <AdminFormSection title="Khối lớp" description={editing ? 'Thay thế toàn bộ danh sách trong một request độc lập.' : 'Khối lớp được tạo cùng bản nháp trong một transaction.'}>
        <div className="flex gap-5 text-sm text-[var(--text-secondary)]">{[10, 11, 12].map(grade => <label key={grade} className="flex items-center gap-2"><input type="checkbox" checked={grades.includes(grade)} onChange={event => { setGrades(previous => event.target.checked ? [...previous, grade].sort() : previous.filter(value => value !== grade)); setGradeDirty(true); setGradeSuccess(''); }} />Lớp {grade}</label>)}</div>
        {gradeError && <p className="mt-3 text-sm text-[var(--accent)]">{gradeError} {gradeError.includes('thay đổi') && <button type="button" onClick={reload} className="underline">Tải lại</button>}</p>}
        {editing && <div className="mt-4 flex items-center justify-between"><span className="text-xs text-[var(--text-muted)]">{gradeSuccess}</span><button type="button" disabled={mutationSaving || !gradeDirty} onClick={saveGrades} className="admin-primary-button disabled:cursor-not-allowed disabled:opacity-50">{gradeSaving ? 'Đang lưu…' : 'Lưu khối lớp'}</button></div>}
      </AdminFormSection>
      {editing && detail && <AdminFormSection title="Dữ liệu chỉ đọc"><p className="text-sm text-[var(--text-secondary)]">Media, thumbnail, geography, hierarchy và nguồn được giữ nguyên và chỉ hiển thị ở trang chi tiết.</p><p className="mt-2 text-xs text-[var(--text-muted)]">Phiên bản hiện tại: {version}</p></AdminFormSection>}
    </AdminLayout>
  );
}
