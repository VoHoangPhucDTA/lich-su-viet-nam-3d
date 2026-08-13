import ExamFormPicker, { type ExamFormPickerOption } from './ExamFormPicker';

export interface TopicComboboxOption {
  slug: string;
  title: string;
  questionCount: number;
  mcqCount: number;
  tfCount: number;
}

interface TopicComboboxProps {
  id?: string;
  label: string;
  placeholder?: string;
  emptyMessage?: string;
  options: TopicComboboxOption[];
  selectedSlug: string;
  onSelect: (option: TopicComboboxOption) => void;
  disabled?: boolean;
}

/**
 * Accessible editable single-select Topic picker used inside the
 * "Một chủ đề" scope of Create Exam.
 *
 * The component delegates its shell, listbox, and keyboard contract
 * semantics to {@link ExamFormPicker}. The trigger element is the
 * `role="combobox"` `<input>` so typing on it filters the popup,
 * which exactly matches the WAI-ARIA 1.2 combobox pattern.
 *
 * The component keeps a Topic-flavored API (`onSelect(option)`,
 * `selectedSlug`) so the Create-Exam page can work with canonical
 * topic metadata without translating between slugs and picker values.
 */
export default function TopicCombobox({
  id,
  label,
  placeholder = 'Tìm hoặc chọn chủ đề...',
  emptyMessage = 'Không tìm thấy chủ đề phù hợp.',
  options,
  selectedSlug,
  onSelect,
  disabled = false,
}: TopicComboboxProps) {
  const pickerOptions: ExamFormPickerOption[] = options.map((option) => ({
    value: option.slug,
    label: option.title,
    meta: `${option.questionCount} câu · ${option.mcqCount} TN · ${option.tfCount} Đ/S`,
  }));

  return (
    <ExamFormPicker
      id={id}
      label={label}
      placeholder={placeholder}
      emptyMessage={emptyMessage}
      options={pickerOptions}
      value={selectedSlug}
      searchable
      disabled={disabled}
      onChange={(value) => {
        const match = options.find((option) => option.slug === value);
        if (match) onSelect(match);
      }}
    />
  );
}
