import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EventMediaGallery from '../EventMediaGallery';

const BASE_ITEMS = [
  { id: 'hero', type: 'image' as const, url: 'https://cdn.example/hero.png', caption: 'hero' },
  { id: 'supp-a', type: 'image' as const, url: 'https://cdn.example/supp-a.png', caption: 'supplement a' },
  { id: 'supp-b', type: 'image' as const, url: 'https://cdn.example/supp-b.png', caption: 'supplement b' },
];

describe('EventMediaGallery representative-image dedup', () => {
  it('A. keeps hero visible and renders only the two supplementary images in the gallery', () => {
    render(
      <EventMediaGallery
        media={{
          thumbnail: 'https://cdn.example/hero.png',
          items: BASE_ITEMS,
        }}
      />,
    );

    // Section header is shown.
    expect(screen.getByText('Tư liệu hình ảnh & video')).toBeInTheDocument();

    // The hero image is NOT rendered inside the media section: it appears
    // exactly once total across the rendered image elements scoped to the
    // gallery (the hero is also rendered by the parent EventHero on the page,
    // so we only assert gallery scoping here).
    const gallerySection = screen.getByText('Tư liệu hình ảnh & video').closest('section')!;
    const galleryImages = within(gallerySection).getAllByRole('img');
    const gallerySrcs = galleryImages.map((node) => node.getAttribute('src'));
    expect(gallerySrcs).toEqual([
      'https://cdn.example/supp-a.png',
      'https://cdn.example/supp-b.png',
    ]);
    expect(gallerySrcs).not.toContain('https://cdn.example/hero.png');
  });

  it('B. hides the entire gallery section when only the representative asset exists', () => {
    const { container } = render(
      <EventMediaGallery
        media={{
          thumbnail: 'https://cdn.example/hero-only.png',
          items: [
            { id: 'hero', type: 'image' as const, url: 'https://cdn.example/hero-only.png', caption: 'hero' },
          ],
        }}
      />,
    );

    // Section header text is rendered by the EventHero/SectionHeader, not
    // EventMediaGallery itself: here we just assert there is NO media section
    // element under EventMediaGallery.
    expect(container.querySelector('#media')).toBeNull();
    expect(screen.queryByText('Tư liệu hình ảnh & video')).not.toBeInTheDocument();
  });

  it('C. hides the section when no representative is supplied and items[] is empty', () => {
    const { container } = render(<EventMediaGallery media={undefined} />);
    expect(container.querySelector('#media')).toBeNull();
  });

  it('D. uses URL fallback to dedup when items[] lacks a stable id (slug-only collector)', () => {
    render(
      <EventMediaGallery
        media={{
          thumbnail: 'https://cdn.example/cover.png',
          items: [
            { id: 'a', type: 'image' as const, url: 'https://cdn.example/cover.png', caption: 'cover' },
            { id: 'b', type: 'image' as const, url: 'https://cdn.example/extra.png', caption: 'extra' },
          ],
        }}
      />,
    );

    const gallerySection = screen.getByText('Tư liệu hình ảnh & video').closest('section')!;
    const galleryImages = within(gallerySection).getAllByRole('img');
    const gallerySrcs = galleryImages.map((node) => node.getAttribute('src'));
    expect(gallerySrcs).toEqual(['https://cdn.example/extra.png']);
  });

  it('E. suppresses representative when the hero is the only asset (no fallback empty card)', () => {
    render(
      <EventMediaGallery
        media={{
          thumbnail: 'https://cdn.example/lone.png',
          items: [
            { id: 'hero', type: 'image' as const, url: 'https://cdn.example/lone.png', caption: 'hero' },
          ],
        }}
      />,
    );

    expect(screen.queryByText('Tư liệu hình ảnh & video')).not.toBeInTheDocument();
    expect(screen.queryByText('Chưa có tư liệu hình ảnh hoặc video cho sự kiện này.')).not.toBeInTheDocument();
  });

  it('F. hero + video: gallery keeps the video and never re-renders the cover image', () => {
    render(
      <EventMediaGallery
        media={{
          thumbnail: 'https://cdn.example/cover.png',
          items: [
            { id: 'cover', type: 'image' as const, url: 'https://cdn.example/cover.png', caption: 'cover' },
            { id: 'vid', type: 'video' as const, url: 'https://cdn.example/clip.mp4', caption: 'clip' },
          ],
        }}
      />,
    );

    const gallerySection = screen.getByText('Tư liệu hình ảnh & video').closest('section')!;
    const galleryImages = within(gallerySection).queryAllByRole('img');
    expect(galleryImages.map((n) => n.getAttribute('src'))).toEqual([]);
    // Video card is still rendered (no <img> for video but the label is present).
    expect(within(gallerySection).getByText('clip')).toBeInTheDocument();
    expect(within(gallerySection).getByText('Video')).toBeInTheDocument();
  });
});
