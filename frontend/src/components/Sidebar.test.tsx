import { render, screen } from '@testing-library/react';
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
});
