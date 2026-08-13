import ExamFormPicker from './ExamFormPicker';

export interface PeriodSelectorOption {
  slug: string;
  title: string;
}

interface PeriodSelectorProps {
  id?: string;
  label: string;
  placeholder?: string;
  emptyMessage?: string;
  options: PeriodSelectorOption[];
  value: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
}

/**
 * Non-searchable single-select picker used inside the "Một giai đoạn" scope
 * of Create Exam. Mirrors the TopicCombobox visual shell and keyboard
 * contract (see {@link ExamFormPicker}) so the two selectors feel identical
 * when closed and behave predictably on focus / arrow / Enter / Escape / Tab.
 *
 * The number of canonical period options is small (<=8 per audit), so we
 * intentionally avoid building a search filter, keeping interaction simple
 * and aligned with the rest of the Create-Exam direct-choice controls.
 */
export default function PeriodSelector({
  id,
  label,
  placeholder = 'Chọn giai đoạn…',
  emptyMessage = 'Chưa có giai đoạn phù hợp.',
  options,
  value,
  onChange,
  disabled = false,
}: PeriodSelectorProps) {
  return (
    <ExamFormPicker
      id={id}
      label={label}
      placeholder={placeholder}
      emptyMessage={emptyMessage}
      options={options.map((option) => ({ value: option.slug, label: option.title }))}
      value={value}
      searchable={false}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
