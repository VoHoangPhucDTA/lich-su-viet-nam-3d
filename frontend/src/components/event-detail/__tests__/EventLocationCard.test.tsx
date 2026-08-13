import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EventLocationCard from '../EventLocationCard';
import type { MockEventDetail } from '../../../data/mockEventDetails';

const tagsVietnam = ['chu-nom', 'van-hoc'];
const tagWorldHistory = 'lịch sử thế giới';

function buildEvent(overrides: Partial<MockEventDetail> = {}): MockEventDetail {
  return {
    id: 'event-no-location',
    slug: 'event-no-location',
    entityType: 'event',
    eventLevel: 'atomic',
    titles: { primary: 'Sự kiện không có vị trí cụ thể', short: 'No-location' },
    classification: { eventType: 'cultural', tags: tagsVietnam },
    coverage: { grades: ['10'] },
    chronology: { start: '1945', datePrecision: 'year', displayDate: '1945' },
    mapData: {
      displayGeometry: { geoType: 'no_location' },
      focusGeometry: { center: [0, 0], zoom: 5 },
    },
    summary: { homepageTitle: 'Sự kiện', homepageSummary: '', cardSummary: '' },
    textbookContent: { canonicalSummary: '' },
    display: { showOnHomepage: true, showOnTimeline: true, featured: false },
    sourcePolicy: { canonicalSource: '' },
    ...overrides,
  };
}

describe('EventLocationCard', () => {
  it('renders the compact "Không có địa điểm cụ thể" copy for Vietnam events with no_location', () => {
    render(
      <MemoryRouter>
        <EventLocationCard event={buildEvent()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Không có địa điểm cụ thể')).toBeInTheDocument();
    expect(screen.queryByText(/Sự kiện này không gắn với một địa điểm cụ thể trên bản đồ/)).not.toBeInTheDocument();
    expect(screen.queryByText('Không rõ')).not.toBeInTheDocument();
  });

  it('does not render the card at all for foreign-history events regardless of geo_type', () => {
    const { container } = render(
      <MemoryRouter>
        <EventLocationCard
          event={buildEvent({
            classification: { eventType: 'political', tags: ['cuba', tagWorldHistory] },
            mapData: {
              displayGeometry: { geoType: 'no_location' },
            },
          })}
        />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the provinces list and 3D map CTA when geo_type is renderable', () => {
    render(
      <MemoryRouter>
        <EventLocationCard
          event={buildEvent({
            titles: { primary: 'Sự kiện có vị trí' },
            mapData: {
              displayGeometry: {
                geoType: 'nationwide',
                provinceNames: ['Hà Nội', 'TP. Hồ Chí Minh'],
                historicalLocations: ['Đại La'],
              },
            },
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Toàn quốc')).toBeInTheDocument();
    expect(screen.getByText('Hà Nội')).toBeInTheDocument();
    expect(screen.getByText('TP. Hồ Chí Minh')).toBeInTheDocument();
    expect(screen.getByText('Đại La')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem trên bản đồ 3D' })).toBeInTheDocument();
    expect(screen.queryByText('Không có địa điểm cụ thể')).not.toBeInTheDocument();
  });

  it.each([
    [['Quảng Nam'], 'Một vùng'],
    [['Quảng Bình', 'Bình Thuận'], 'Nhiều vùng'],
    [[], 'Vùng'],
  ])('uses province cardinality for multi_polygon %j', (provinceNames, expectedLabel) => {
    render(
      <MemoryRouter>
        <EventLocationCard
          event={buildEvent({
            mapData: {
              displayGeometry: {
                geoType: 'multi_polygon',
                provinceNames,
              },
            },
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });
});
