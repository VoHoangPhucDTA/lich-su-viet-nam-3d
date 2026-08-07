import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HistoricalEvent } from '../types/event';
import Sidebar from './Sidebar';

const longTitle = 'Sự kiện lịch sử có tiêu đề rất dài '.repeat(5);
const longChronology = 'Khoảng thời gian lịch sử rất dài cần được xuống dòng rõ ràng '.repeat(2);

const child: HistoricalEvent = {
  id: 'child', name: 'Sự kiện con', description: '', startYear: 938, endYear: null,
  effectiveEndYear: 938, eventType: 'political', geoType: 'nationwide', parentId: 'parent',
};

const parent: HistoricalEvent = {
  id: 'parent', name: longTitle, description: '', startYear: 938, endYear: null,
  effectiveEndYear: 938, displayDate: longChronology, eventType: 'political',
  geoType: 'nationwide', parentId: null, children: [child], childCount: 1,
};

describe('Sidebar event rows', () => {
  it('keeps long title, chronology and child order in separate grid areas', async () => {
    render(
      <Sidebar
        events={[parent]}
        selectedEvent={parent}
        onSelectEvent={vi.fn()}
        onHoverEvent={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        activeCategory={null}
        onActiveCategoryChange={vi.fn()}
        listItemCount={1}
        markerCount={1}
      />
    );

    const parentTitle = screen.getByText(longTitle.trim());
    const chronology = screen.getByText(longChronology.trim());
    const childTitle = await screen.findByTitle('Sự kiện con');

    expect(parentTitle).toHaveClass('map-event-title');
    expect(chronology).toHaveClass('map-event-chronology');
    expect(parentTitle.compareDocumentPosition(chronology) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chronology.compareDocumentPosition(childTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lets keyboard users select an event from the sidebar', async () => {
    const user = userEvent.setup();
    const onSelectEvent = vi.fn();
    const onHoverEvent = vi.fn();

    render(
      <Sidebar
        events={[parent]}
        selectedEvent={null}
        onSelectEvent={onSelectEvent}
        onHoverEvent={onHoverEvent}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        activeCategory={null}
        onActiveCategoryChange={vi.fn()}
        listItemCount={1}
        markerCount={1}
      />,
    );

    const selectEvent = screen.getByRole('button', { name: `Chọn sự kiện ${longTitle.trim()}` });
    selectEvent.focus();
    expect(selectEvent).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onSelectEvent).toHaveBeenCalledWith(parent);
    expect(onHoverEvent).toHaveBeenCalledWith(parent.id);
  });

  it('renders activeCategory as a controlled prop', async () => {
    render(
      <Sidebar
        events={[parent]}
        selectedEvent={parent}
        onSelectEvent={vi.fn()}
        onHoverEvent={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        activeCategory="political"
        onActiveCategoryChange={vi.fn()}
        listItemCount={1}
        markerCount={1}
      />,
    );

    expect(screen.getByRole('button', { name: 'Chính trị' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await screen.findByTitle('Sự kiện con')).toBeInTheDocument();
  });

  it('requests category changes without filtering the provided tree locally', async () => {
    const user = userEvent.setup();
    const onActiveCategoryChange = vi.fn();
    render(
      <Sidebar
        events={[parent]}
        selectedEvent={null}
        onSelectEvent={vi.fn()}
        onHoverEvent={vi.fn()}
        searchQuery="không khớp tiêu đề"
        onSearchQueryChange={vi.fn()}
        activeCategory={null}
        onActiveCategoryChange={onActiveCategoryChange}
        listItemCount={1}
        markerCount={1}
      />,
    );

    expect(screen.getByText(longTitle.trim())).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Quân sự' }));
    expect(onActiveCategoryChange).toHaveBeenCalledWith('military');
  });

  it.each([
    [2, 3, '2 mục trong danh sách • 3 điểm trên bản đồ'],
    [0, 0, '0 mục trong danh sách • 0 điểm trên bản đồ'],
    [1, 1, '1 mục trong danh sách • 1 điểm trên bản đồ'],
  ])('renders controlled list and marker counts for %s/%s', (listItemCount, markerCount, expected) => {
    render(
      <Sidebar
        events={listItemCount ? [parent] : []}
        selectedEvent={null}
        onSelectEvent={vi.fn()}
        onHoverEvent={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        activeCategory={null}
        onActiveCategoryChange={vi.fn()}
        listItemCount={listItemCount}
        markerCount={markerCount}
      />,
    );

    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
