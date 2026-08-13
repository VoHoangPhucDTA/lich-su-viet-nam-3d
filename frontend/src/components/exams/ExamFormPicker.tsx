import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';

/**
 * Single option rendered inside {@link ExamFormPicker}'s listbox popup.
 * `value` is committed back to the parent; `label` is rendered as the option
 * title; `meta` (optional) is rendered as a secondary line under the title.
 */
export interface ExamFormPickerOption {
  value: string;
  label: string;
  meta?: string;
}

export interface ExamFormPickerProps {
  id?: string;
  /** Visible label attached to the trigger via `htmlFor` / `aria-label`. */
  label: string;
  /** Placeholder shown when the editable trigger has no query and no value. */
  placeholder?: string;
  /** Message displayed when no options match the active query (searchable) or the list is empty. */
  emptyMessage?: string;
  options: ExamFormPickerOption[];
  /** Selected option value. */
  value: string;
  /** Fired with the new value whenever an option is committed (Enter / click / native change). */
  onChange: (value: string) => void;
  /**
   * `true` → editable trigger (text input is the `role="combobox"` element,
   *   typing filters options, selected label is auto-typed when no query).
   * `false` → non-editable trigger (button is the `role="combobox"` element,
   *   selected label is rendered as the button's text content).
   */
  searchable: boolean;
  disabled?: boolean;
}

/**
 * Single single-select listbox/combobox shell used by every Create-Exam Picker.
 *
 * Both editable and non-editable variants expose the SAME user contract:
 *
 * Trigger element (`role="combobox"`, either `<input>` or `<button>`):
 *   - `aria-expanded={open}`
 *   - `aria-controls={listboxId}`
 *   - `aria-activedescendant={open ? activeOptionId : undefined}`
 *   - `aria-autocomplete="list"` (editable only)
 *   - chevron `▾` rendered absolutely to the right, no native browser arrow
 *
 * Popup (`<ul role="listbox">`):
 *   - bounded `max-height`, internal vertical scroll, custom scrollbar
 *   - same border-radius, padding, and font-size as the rest of the form
 *   - selected option carries `aria-selected="true"` with a `✓` prefix
 *   - active option (focused via keyboard) carries its own background only
 *   - `scrollIntoView({ block: 'nearest' })` keeps the active option in view
 *     as the user keyboard-navigates; this never moves page scroll.
 *
 * Keyboard:
 *   - ArrowDown / ArrowUp move active option; Home / End jump to ends.
 *   - Enter commits the active option.
 *   - Escape closes the popup. Focus returns to the trigger (the trigger
 *     already IS the combobox).
 *   - Tab closes the popup and resumes native Tab order. Focus advances to
 *     the NEXT focusable element in document order; no focus trap, no
 *     return-to-trigger.
 *
 * Click-outside:
 *   - A document `mousedown` listener closes the popup if the click lands
 *     outside the trigger and outside the listbox.
 */
export default function ExamFormPicker({
  id,
  label,
  placeholder = 'Tìm hoặc chọn…',
  emptyMessage = 'Không có lựa chọn phù hợp.',
  options,
  value,
  onChange,
  searchable,
  disabled = false,
}: ExamFormPickerProps) {
  const generatedId = useId();
  const baseId = id ?? `exam-picker-${generatedId}`;
  const listboxId = `${baseId}-listbox`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [userActiveIndex, setUserActiveIndex] = useState<number | null>(null);

  const triggerRef = useRef<HTMLElement | null>(null);
  const listboxRef = useRef<HTMLUListElement | null>(null);
  const optionRefs = useRef<Map<string, HTMLLIElement | null>>(new Map());

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    if (!searchable) return options;
    const normalizedQuery = normalizeForSearch(query.trim());
    if (!normalizedQuery) return options;
    return options.filter((option) => normalizeForSearch(option.label).includes(normalizedQuery));
  }, [options, query, searchable]);

  const resolvedActiveIndex = useMemo<number>(() => {
    if (!open) return -1;
    if (filteredOptions.length === 0) return -1;
    if (userActiveIndex !== null && userActiveIndex < filteredOptions.length) {
      return userActiveIndex;
    }
    const selectedIndex = filteredOptions.findIndex((option) => option.value === value);
    return selectedIndex >= 0 ? selectedIndex : 0;
  }, [open, filteredOptions, value, userActiveIndex]);

  const openPopup = useCallback(() => {
    if (disabled) return;
    setOpen(true);
  }, [disabled]);

  const closePopup = useCallback(() => {
    setOpen(false);
    setQuery('');
    setUserActiveIndex(null);
  }, []);

  const commitOption = useCallback(
    (option: ExamFormPickerOption) => {
      onChange(option.value);
      closePopup();
    },
    [onChange, closePopup],
  );

  function moveActive(delta: number) {
    if (!open) {
      setOpen(true);
      return;
    }
    if (filteredOptions.length === 0) return;
    const base = userActiveIndex !== null ? userActiveIndex : resolvedActiveIndex;
    const reference = base >= 0 ? base : -1;
    const next =
      reference < 0
        ? 0
        : (reference + delta + filteredOptions.length) % filteredOptions.length;
    setUserActiveIndex(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActive(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        moveActive(-1);
        return;
      case 'Enter': {
        if (!open) {
          event.preventDefault();
          openPopup();
          return;
        }
        event.preventDefault();
        if (resolvedActiveIndex >= 0) {
          const target = filteredOptions[resolvedActiveIndex];
          if (target) commitOption(target);
        }
        return;
      }
      case 'Escape':
        event.preventDefault();
        if (open) {
          closePopup();
        } else if (searchable && query) {
          setQuery('');
        }
        return;
      case 'Home':
        if (open && filteredOptions.length > 0) {
          event.preventDefault();
          setUserActiveIndex(0);
        }
        return;
      case 'End':
        if (open && filteredOptions.length > 0) {
          event.preventDefault();
          setUserActiveIndex(filteredOptions.length - 1);
        }
        return;
      default:
        return;
    }
  }

  function handleTriggerBlur(event: FocusEvent<HTMLElement>) {
    const next = event.relatedTarget as Node | null;
    if (next && listboxRef.current?.contains(next)) return;
    closePopup();
  }

  function handleTriggerClick() {
    openPopup();
  }

  function handleTriggerFocus() {
    if (!open) openPopup();
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setUserActiveIndex(null);
    if (!open) setOpen(true);
  }

  // Scroll active descendant into view inside the listbox. When the keyboard
  // moves selection past the visible popup, this keeps it in view WITHOUT
  // moving page scroll.
  useEffect(() => {
    if (!open) return;
    if (resolvedActiveIndex < 0) return;
    const option = filteredOptions[resolvedActiveIndex];
    if (!option) return;
    const node = optionRefs.current.get(option.value);
    if (!node) return;
    const element = node as Element & { scrollIntoView?: (s?: ScrollIntoViewOptions) => void };
    if (typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest' });
    }
  }, [resolvedActiveIndex, filteredOptions, open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (listboxRef.current?.contains(target)) return;
      closePopup();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, closePopup]);

  const activeOption = resolvedActiveIndex >= 0 ? filteredOptions[resolvedActiveIndex] : null;
  const activeOptionId = activeOption ? `${baseId}-opt-${activeOption.value}` : undefined;
  const triggerValue = searchable
    ? query || (selectedOption?.label ?? '')
    : selectedOption?.label ?? '';

  return (
    <div style={wrapperStyle}>
      <label htmlFor={baseId} style={labelStyle}>{label}</label>
      <div
        className="form-control-wrap exam-form-picker-wrap"
        data-open={open ? 'true' : 'false'}
        data-searchable={searchable ? 'true' : 'false'}
      >
        {searchable ? (
          <input
            ref={triggerRef as React.RefObject<HTMLInputElement>}
            id={baseId}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={listboxId}
            aria-activedescendant={open ? activeOptionId : undefined}
            aria-autocomplete="list"
            aria-label={label}
            aria-disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            value={triggerValue}
            readOnly={disabled}
            placeholder={placeholder}
            disabled={disabled}
            data-empty={!triggerValue ? 'true' : 'false'}
            className="form-control exam-form-picker-input"
            onClick={handleTriggerClick}
            onFocus={handleTriggerFocus}
            onBlur={handleTriggerBlur}
            onKeyDown={handleKeyDown}
            onChange={handleInputChange}
          />
        ) : (
          <button
            ref={triggerRef as React.RefObject<HTMLButtonElement>}
            id={baseId}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={listboxId}
            aria-activedescendant={open ? activeOptionId : undefined}
            aria-label={label}
            aria-disabled={disabled}
            disabled={disabled}
            className="form-control exam-form-picker-trigger"
            onClick={handleTriggerClick}
            onFocus={handleTriggerFocus}
            onBlur={handleTriggerBlur}
            onKeyDown={handleKeyDown}
          >
            <span
              className="exam-form-picker-trigger-label"
              data-empty={!selectedOption ? 'true' : 'false'}
            >
              {selectedOption?.label ?? placeholder}
            </span>
          </button>
        )}
        <span aria-hidden="true" style={chevronStyle}>▾</span>
      </div>
      {open && (
        <div style={popupStyle} className="exam-form-picker-popup">
          {searchable && (
            <span className="exam-form-picker-hint" aria-hidden="true">
              {filteredOptions.length} kết quả
            </span>
          )}
          {filteredOptions.length === 0 ? (
            <p role="status" style={emptyStyle}>{emptyMessage}</p>
          ) : (
            <ul
              ref={listboxRef}
              id={listboxId}
              role="listbox"
              tabIndex={-1}
              aria-label={label}
              style={listboxStyle}
              className="exam-form-picker-listbox"
            >
              {filteredOptions.map((option, index) => {
                const isActive = index === resolvedActiveIndex;
                const isSelected = option.value === value;
                return (
                  <li
                    key={option.value}
                    id={`${baseId}-opt-${option.value}`}
                    role="option"
                    aria-selected={isSelected}
                    style={{
                      ...optionStyle,
                      background: isActive ? 'var(--accent-soft)' : 'var(--bg-card)',
                      color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                    }}
                    ref={(node) => {
                      optionRefs.current.set(option.value, node);
                    }}
                    onMouseEnter={() => setUserActiveIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      commitOption(option);
                    }}
                  >
                    {option.meta ? (
                      <span style={optionMetaColumnStyle}>
                        <strong style={optionTitleStyle}>{option.label}</strong>
                        <span style={optionMetaStyle}>{option.meta}</span>
                      </span>
                    ) : (
                      <strong style={optionTitleStyle}>{option.label}</strong>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

const wrapperStyle: CSSProperties = {
  display: 'grid',
  gap: '0.4rem',
  position: 'relative',
  minWidth: 0,
};

const labelStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '0.78rem',
  fontWeight: 800,
};

const chevronStyle: CSSProperties = {
  position: 'absolute',
  right: '0.75rem',
  top: '50%',
  transform: 'translateY(-50%)',
  pointerEvents: 'none',
  color: 'var(--text-muted)',
  fontSize: '0.85rem',
};

const popupStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 0.35rem)',
  left: 0,
  right: 0,
  zIndex: 30,
  background: 'var(--bg-card)',
  border: '1px solid var(--border-strong)',
  borderRadius: '0.65rem',
  boxShadow: 'var(--shadow-md)',
  display: 'grid',
  gap: 0,
  overflow: 'hidden',
  minWidth: '14rem',
};

const listboxStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: '0.35rem',
  maxHeight: 'min(60vh, 22rem)',
  overflowY: 'auto',
  display: 'grid',
  gap: '0.15rem',
};

const optionStyle: CSSProperties = {
  display: 'grid',
  gap: '0.15rem',
  padding: '0.55rem 0.65rem',
  borderRadius: '0.5rem',
  cursor: 'pointer',
  userSelect: 'none',
  lineHeight: 1.35,
};

const optionMetaColumnStyle: CSSProperties = {
  display: 'grid',
  gap: '0.15rem',
};

const optionTitleStyle: CSSProperties = {
  fontSize: '0.92rem',
  fontWeight: 700,
  overflowWrap: 'anywhere',
};

const optionMetaStyle: CSSProperties = {
  fontSize: '0.74rem',
  color: 'var(--text-muted)',
};

const emptyStyle: CSSProperties = {
  margin: 0,
  padding: '1rem',
  color: 'var(--text-muted)',
  textAlign: 'center',
  fontSize: '0.85rem',
};
