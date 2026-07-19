import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../layouts/AdminLayout';
import { AdminErrorState, AdminFormSection, AdminPageHeader, AdminSelect } from '../../components/admin/AdminUI';
import { createAdminEvent, getAdminEvent, updateAdminEvent } from '../../services/adminApi';

type EditorForm = { title: string; slug: string; eventLevel: string; eventType: string; startYear: string; endYear: string; cardSummary: string; canonicalSummary: string; detailedNarrative: string; significance: string; status: string };
const initialForm: EditorForm = { title: '', slug: '', eventLevel: 'atomic', eventType: 'political', startYear: '', endYear: '', cardSummary: '', canonicalSummary: '', detailedNarrative: '', significance: '', status: 'draft' };
const fieldClass = 'mt-1.5 min-h-11 w-full rounded-[var(--admin-radius)] border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--admin-accent)]';

function Field({ label, value, onChange, required = false, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return <label className="block text-sm font-semibold text-[var(--text-secondary)]">{label}{required && <span className="ml-1 text-[var(--accent)]">*</span>}<input required={required} type={type} value={value} onChange={event => onChange(event.target.value)} className={fieldClass} /></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="block text-sm font-semibold text-[var(--text-secondary)]">{label}<div className="mt-1.5"><AdminSelect value={value} onValueChange={onChange} options={options} label={label} /></div></label>;
}
function TextAreaField({ label, value, onChange, rows = 4 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return <label className="block text-sm font-semibold text-[var(--text-secondary)]">{label}<textarea value={value} onChange={event => onChange(event.target.value)} rows={rows} className={`${fieldClass} resize-y py-3`} /></label>;
}

export default function AdminEventEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);
  const [form, setForm] = useState<EditorForm>(initialForm);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getAdminEvent(id).then(event => setForm(previous => ({ ...previous, ...event, startYear: String(event.startYear ?? ''), endYear: String(event.endYear ?? '') } as EditorForm))).catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể tải sự kiện.')).finally(() => setLoading(false));
  }, [id]);

  const update = (key: keyof EditorForm, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = { ...form, startYear: Number(form.startYear), endYear: form.endYear ? Number(form.endYear) : null };
    try {
      const saved = editing ? await updateAdminEvent(id!, payload) : await createAdminEvent(payload);
      navigate(`/admin/events/${String(saved.id)}/edit`, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu sự kiện.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <AdminLayout title="Chỉnh sửa sự kiện"><div className="flex min-h-48 items-center justify-center text-sm text-[var(--text-muted)]">Đang tải sự kiện…</div></AdminLayout>;
  if (error && editing && !form.title) return <AdminLayout title="Chỉnh sửa sự kiện"><AdminErrorState message={error} onRetry={() => window.location.reload()} /></AdminLayout>;

  return <AdminLayout title={editing ? 'Chỉnh sửa sự kiện' : 'Tạo sự kiện'}>
    <div className="mb-4"><Link to="/admin/events" className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--accent)]">← Quay lại danh sách</Link></div>
    <AdminPageHeader title={editing ? 'Chỉnh sửa sự kiện' : 'Tạo sự kiện'} />
    {error && <div className="mb-5 rounded-lg border border-[var(--accent)]/20 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--accent)]">{error}</div>}
    <form onSubmit={submit} className="space-y-5">
      <AdminFormSection title="Thông tin cơ bản" description="Định danh và phân loại chính của sự kiện."><div className="grid gap-4 md:grid-cols-2"><Field label="Tên sự kiện" value={form.title} onChange={value => update('title', value)} required /><Field label="Slug" value={form.slug} onChange={value => update('slug', value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'))} required /><SelectField label="Cấp độ" value={form.eventLevel} onChange={value => update('eventLevel', value)} options={[{ value: 'atomic', label: 'Sự kiện đơn' }, { value: 'collection', label: 'Bộ sưu tập' }]} /><SelectField label="Loại sự kiện" value={form.eventType} onChange={value => update('eventType', value)} options={[{ value: 'political', label: 'Chính trị' }, { value: 'military', label: 'Quân sự' }, { value: 'economic', label: 'Kinh tế' }, { value: 'cultural', label: 'Văn hóa - xã hội' }]} /></div></AdminFormSection>
      <AdminFormSection title="Thời gian" description="Phân loại theo năm bắt đầu; năm kết thúc là tùy chọn."><div className="grid gap-4 md:grid-cols-2"><Field label="Năm bắt đầu" value={form.startYear} onChange={value => update('startYear', value)} required type="number" /><Field label="Năm kết thúc" value={form.endYear} onChange={value => update('endYear', value)} type="number" /></div></AdminFormSection>
      <AdminFormSection title="Nội dung" description="Nội dung dùng cho thẻ, trang chi tiết và ngữ cảnh học tập."><div className="space-y-4"><TextAreaField label="Tóm tắt thẻ" value={form.cardSummary} onChange={value => update('cardSummary', value)} rows={3} /><TextAreaField label="Tóm tắt chính" value={form.canonicalSummary} onChange={value => update('canonicalSummary', value)} rows={4} /><TextAreaField label="Nội dung chi tiết" value={form.detailedNarrative} onChange={value => update('detailedNarrative', value)} rows={8} /><TextAreaField label="Ý nghĩa lịch sử" value={form.significance} onChange={value => update('significance', value)} rows={4} /></div></AdminFormSection>
      <AdminFormSection title="Xuất bản"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><SelectField label="Trạng thái" value={form.status} onChange={value => update('status', value)} options={[{ value: 'draft', label: 'Bản nháp' }, { value: 'published', label: 'Đã xuất bản' }, { value: 'archived', label: 'Lưu trữ' }]} /><div className="flex gap-2"><Link to="/admin/events" className="admin-secondary-button inline-flex items-center no-underline">Hủy</Link><button type="submit" disabled={saving} className="admin-primary-button disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Đang lưu…' : 'Lưu sự kiện'}</button></div></div></AdminFormSection>
    </form>
  </AdminLayout>;
}