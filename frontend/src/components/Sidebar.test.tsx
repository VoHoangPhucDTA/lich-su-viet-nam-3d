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

const baseProps = {
  events: [parent],
  selectedEvent: null,
  onSelectEvent: vi.fn(),
  onHoverEvent: vi.fn(),
  searchQuery: '',
  onSearchQueryChange: vi.fn(),
  activeCategory: null,
  onActiveCategoryChange: vi.fn(),
  selectedGrade: null,
  onGradeChange: vi.fn(),
  listItemCount: 1,
  mappedEventCount: 1,
};

describe('Sidebar event rows', () => {
  it('keeps long title, chronology and child order in separate areas', async () => {
    render(<Sidebar {...baseProps} selectedEvent={parent} />);
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
    render(<Sidebar {...baseProps} onSelectEvent={onSelectEvent} onHoverEvent={onHoverEvent} />);

    const selectEvent = screen.getByRole('button', { name: `Chọn sự kiện ${longTitle.trim()}` });
    selectEvent.focus();
    expect(selectEvent).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelectEvent).toHaveBeenCalledWith(parent);
    expect(onHoverEvent).toHaveBeenCalledWith(parent.id);
  });

  it('renders category and grade as controlled props', async () => {
    render(<Sidebar {...baseProps} selectedEvent={parent} activeCategory="political" selectedGrade={11} />);
    expect(screen.getByRole('button', { name: 'Chính trị' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Chương trình lớp 11' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await screen.findByTitle('Sự kiện con')).toBeInTheDocument();
  });

  it('reveals the ancestor chain for a selected descendant', async () => {
    render(<Sidebar {...baseProps} selectedEvent={child} mappedEventCount={0} />);
    expect(await screen.findByRole('button', { name: 'Chọn sự kiện Sự kiện con' }))
      .toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Thu gọn' })).toBeInTheDocument();
  });

  it('uses row padding as the single indentation owner and caps depth 3 at 36px', async () => {
    const depth3 = { ...child, id: 'depth-3', name: 'Depth 3', parentId: 'depth-2' };
    const depth2 = { ...child, id: 'depth-2', name: 'Depth 2', parentId: 'depth-1', children: [depth3] };
    const depth1 = { ...child, id: 'depth-1', name: 'Depth 1', children: [depth2] };
    const root = { ...parent, id: 'root', name: 'Root', children: [depth1] };
    render(<Sidebar {...baseProps} events={[root]} selectedEvent={depth3} />);

    const rootRow = screen.getByRole('button', { name: 'Chọn sự kiện Root' }).closest('.map-event-row');
    const depth3Row = (await screen.findByRole('button', { name: 'Chọn sự kiện Depth 3' }))
      .closest('.map-event-row');
    expect(rootRow).toHaveStyle({ paddingLeft: '12px' });
    expect(depth3Row).toHaveStyle({ paddingLeft: '48px' });
    expect(depth3Row).toHaveAttribute('data-depth', '3');
  });

  it('does not apply the footer class to the header', () => {
    render(<Sidebar {...baseProps} />);
    expect(
      screen.getByRole('heading', { name: 'Sự kiện lịch sử' }).closest('.map-sidebar-footer'),
    ).toBeNull();
  });

  it('requests category changes without filtering the provided tree locally', async () => {
    const user = userEvent.setup();
    const onActiveCategoryChange = vi.fn();
    render(
      <Sidebar
        {...baseProps}
        searchQuery="không khớp tiêu đề"
        onActiveCategoryChange={onActiveCategoryChange}
      />,
    );
    expect(screen.getByText(longTitle.trim())).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Quân sự' }));
    expect(onActiveCategoryChange).toHaveBeenCalledWith('military');
  });

  it('requests a single controlled grade change from the sidebar', async () => {
    const user = userEvent.setup();
    const onGradeChange = vi.fn();
    render(<Sidebar {...baseProps} onGradeChange={onGradeChange} />);
    await user.click(screen.getByRole('button', { name: 'Chương trình lớp 10' }));
    expect(onGradeChange).toHaveBeenCalledWith(10);
  });

  it.each([
    [2, 3, '2 mục chính • 3 sự kiện trên bản đồ'],
    [0, 0, '0 mục chính • 0 sự kiện trên bản đồ'],
    [1, 1, '1 mục chính • 1 sự kiện trên bản đồ'],
  ])('renders controlled list and mapped-event counts for %s/%s', (listItemCount, mappedEventCount, expected) => {
    render(
      <Sidebar
        {...baseProps}
        events={listItemCount ? [parent] : []}
        listItemCount={listItemCount}
        mappedEventCount={mappedEventCount}
      />,
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
