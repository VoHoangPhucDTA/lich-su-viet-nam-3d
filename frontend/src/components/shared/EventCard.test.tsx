import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoricalEvent } from '../../types/event';
import EventCard, { type EventCardImageProfile } from './EventCard';

const { getEventThumbnailDeliveryCandidates, getResponsiveCloudinaryImage } = vi.hoisted(() => ({
  getEventThumbnailDeliveryCandidates: vi.fn(),
  getResponsiveCloudinaryImage: vi.fn(),
}));

vi.mock('../../services/cloudinaryService', () => ({
  getEventThumbnailDeliveryCandidates,
  getResponsiveCloudinaryImage,
}));

const cloudinarySource =
  'https://res.cloudinary.com/demo/image/upload/events/any-safe-event.jpg';
const responsiveWidths = [360, 480, 768];
const profileSizes = {
  home:
    '(min-width: 1280px) 374px, (min-width: 1024px) calc(33.333vw - 52.667px), (min-width: 768px) calc(50vw - 52px), calc(100vw - 50px)',
  browse:
    '(min-width: 1280px) 374px, (min-width: 1024px) calc(33.333vw - 52.667px), (min-width: 640px) calc(50vw - 52px), calc(100vw - 50px)',
  period:
    '(min-width: 1280px) 374px, (min-width: 1024px) calc(33.333vw - 52.667px), (min-width: 640px) calc(50vw - 52px), calc(100vw - 50px)',
} as const;

function makeEvent(overrides: Partial<HistoricalEvent> = {}): HistoricalEvent {
  return {
    id: 'any-safe-event',
    slug: 'any-safe-event',
    name: 'Event title',
    description: 'Event description.',
    startYear: 938,
    endYear: null,
    effectiveEndYear: null,
    eventType: 'military',
    geoType: 'point',
    parentId: null,
    primaryRegions: ['Hai Phong'],
    ...overrides,
  };
}

function renderCard({
  event = makeEvent(),
  imageHeight = 'h-48',
  imageProfile = 'home',
}: {
  event?: HistoricalEvent;
  imageHeight?: string;
  imageProfile?: EventCardImageProfile;
} = {}) {
  return render(
    <MemoryRouter>
      <EventCard event={event} imageHeight={imageHeight} imageProfile={imageProfile} />
    </MemoryRouter>,
  );
}

describe('EventCard responsive image delivery', () => {
  beforeEach(() => {
    getEventThumbnailDeliveryCandidates.mockReset();
    getResponsiveCloudinaryImage.mockReset();
    getEventThumbnailDeliveryCandidates.mockReturnValue([cloudinarySource]);
    getResponsiveCloudinaryImage.mockImplementation((source: string) => {
      if (!source.includes('res.cloudinary.com')) return { src: source };

      return {
        src: `${source}?responsive=480`,
        srcSet: `${source}?responsive=360 360w, ${source}?responsive=480 480w, ${source}?responsive=768 768w`,
      };
    });
  });

  it('uses responsive markup for any safely transformable Cloudinary source without changing card content', () => {
    renderCard();

    const image = screen.getByRole('presentation');
    expect(image).toHaveAttribute('src', `${cloudinarySource}?responsive=480`);
    expect(image).toHaveAttribute('srcset', expect.stringContaining('768w'));
    expect(image).toHaveAttribute('sizes', profileSizes.home);
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(image).toHaveAttribute('width', '768');
    expect(image).toHaveAttribute('height', '432');
    expect(image).toHaveAttribute('alt', '');
    expect(getResponsiveCloudinaryImage).toHaveBeenCalledWith(cloudinarySource, responsiveWidths);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/events/any-safe-event');
    expect(screen.getByText('Event title')).toBeInTheDocument();
  });

  it.each([
    ['home', profileSizes.home],
    ['browse', profileSizes.browse],
    ['period', profileSizes.period],
  ] as const)('uses the %s layout profile sizes', (imageProfile, expectedSizes) => {
    renderCard({ imageProfile });

    expect(screen.getByRole('presentation')).toHaveAttribute('sizes', expectedSizes);
    expect(getResponsiveCloudinaryImage).toHaveBeenCalledWith(cloudinarySource, responsiveWidths);
  });

  it.each([
    ['local', '/event-titles/any-safe-event.jpg'],
    ['non-Cloudinary', 'https://images.example.test/any-safe-event.jpg'],
    ['protected', 'https://res.cloudinary.com/demo/image/authenticated/v1/any-safe-event.jpg'],
  ])('keeps a %s source raw when the helper declines responsive candidates', (_sourceKind, source) => {
    getEventThumbnailDeliveryCandidates.mockReturnValue([source]);
    getResponsiveCloudinaryImage.mockReturnValue({ src: source });
    renderCard({ imageProfile: 'browse' });

    const image = screen.getByRole('presentation');
    expect(image).toHaveAttribute('src', source);
    expect(image).not.toHaveAttribute('srcset');
    expect(image).not.toHaveAttribute('sizes');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(getResponsiveCloudinaryImage).toHaveBeenCalledWith(source, responsiveWidths);
  });

  it('moves to the next source rather than retrying alternate widths after an image error', () => {
    const localFallback = '/event-titles/any-safe-event.jpg';
    getEventThumbnailDeliveryCandidates.mockReturnValue([cloudinarySource, localFallback]);
    renderCard();

    fireEvent.error(screen.getByRole('presentation'));

    const fallbackImage = screen.getByRole('presentation');
    expect(fallbackImage).toHaveAttribute('src', localFallback);
    expect(fallbackImage).not.toHaveAttribute('srcset');
    expect(getResponsiveCloudinaryImage).toHaveBeenLastCalledWith(localFallback, responsiveWidths);

    fireEvent.error(fallbackImage);
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
    expect(getResponsiveCloudinaryImage).toHaveBeenCalledTimes(2);
  });

  it('renders the generic event-type fallback when no candidate remains', () => {
    getEventThumbnailDeliveryCandidates.mockReturnValue([]);
    renderCard();

    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
  });
});
