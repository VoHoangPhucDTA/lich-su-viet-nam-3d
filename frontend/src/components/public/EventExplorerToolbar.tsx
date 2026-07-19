import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS, type EventType } from '../../types/event';
import MuseumSelect, { type MuseumSelectOption } from '../shared/MuseumSelect';

type SortValue = 'year-asc' | 'year-desc' | 'name-asc' | 'name-desc';

interface EventExplorerToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  sortValue: SortValue;
  onSortChange: (value: SortValue) => void;
  yearFrom: string;
  onYearFromChange: (value: string) => void;
  yearTo: string;
  onYearToChange: (value: string) => void;
  activeType?: EventType | null;
  onTypeChange?: (value: EventType | null) => void;
  onReset: () => void;
  rangeError?: string | null;
  searchPlaceholder?: string;
}

const SORT_OPTIONS: MuseumSelectOption<SortValue>[] = [
  { value: 'year-asc', label: 'Năm tăng dần' },
  { value: 'year-desc', label: 'Năm giảm dần' },
  { value: 'name-asc', label: 'Tên A–Z' },
  { value: 'name-desc', label: 'Tên Z–A' },
];

const EVENT_TYPES: EventType[] = ['military', 'political', 'economic', 'cultural'];

export default function EventExplorerToolbar({
  query,
  onQueryChange,
  sortValue,
  onSortChange,
  yearFrom,
  onYearFromChange,
  yearTo,
  onYearToChange,
  activeType,
  onTypeChange,
  onReset,
  rangeError,
  searchPlaceholder = 'Tìm kiếm sự kiện, địa danh...',
}: EventExplorerToolbarProps) {
  const [expanded, setExpanded] = useState(false);
  const activeFilterCount = Number(Boolean(activeType)) + Number(Boolean(yearFrom || yearTo));

  return (
    <section className="public-toolbar" aria-label="Tìm kiếm và lọc sự kiện">
      <div className="flex flex-col gap-3 lg:flex-row">
        <label className="public-search-control">
          <span className="sr-only">Tìm kiếm sự kiện</span>
          <Search size={17} aria-hidden="true" className="shrink-0 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-stone-400"
          />
          {query && (
            <button type="button" onClick={() => onQueryChange('')} className="public-icon-button" aria-label="Xóa nội dung tìm kiếm">
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </label>
        <div className="grid grid-cols-2 gap-3 sm:flex lg:shrink-0">
          <MuseumSelect
            value={sortValue}
            options={SORT_OPTIONS}
            onValueChange={onSortChange}
            label="Sắp xếp sự kiện"
            className="min-w-0 sm:w-44"
          />
          <button
            type="button"
            onClick={() => setExpanded(current => !current)}
            className={`public-filter-button ${expanded || activeFilterCount > 0 ? 'public-filter-button-active' : ''}`}
            aria-expanded={expanded}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            Bộ lọc
            {activeFilterCount > 0 && <span aria-label={`${activeFilterCount} bộ lọc đang dùng`}>({activeFilterCount})</span>}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="public-field">
              <span className="public-field-label">Năm từ</span>
              <input value={yearFrom} onChange={event => onYearFromChange(event.target.value)} inputMode="numeric" placeholder="938" />
            </label>
            <label className="public-field">
              <span className="public-field-label">Năm đến</span>
              <input value={yearTo} onChange={event => onYearToChange(event.target.value)} inputMode="numeric" placeholder="1857" />
            </label>
            {onTypeChange && EVENT_TYPES.map(type => {
              const selected = activeType === type;
              const color = EVENT_TYPE_COLORS[type];
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onTypeChange(selected ? null : type)}
                  className="public-type-filter"
                  style={{
                    borderColor: selected ? `${color}55` : 'var(--border)',
                    background: selected ? `${color}12` : 'var(--bg-card)',
                    color: selected ? color : 'var(--text-secondary)',
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                  {EVENT_TYPE_LABELS[type]}
                </button>
              );
            })}
            {activeFilterCount > 0 && (
              <button type="button" onClick={onReset} className="public-text-button">
                Xóa bộ lọc
              </button>
            )}
          </div>
          {rangeError && <p className="mt-3 text-xs font-medium text-[var(--danger)]">{rangeError}</p>}
        </div>
      )}
    </section>
  );
}
