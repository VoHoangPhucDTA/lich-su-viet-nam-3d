import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { getAppScrollRoot } from './useActiveSection';

export interface SectionInfo {
  id: string;
  label: string;
  /** Weight of this section relative to others (higher = more important). */
  weight: number;
}

/**
 * Track reading progress through meaningful content sections.
 *
 * Uses IntersectionObserver to detect when each section becomes visible.
 * Progress represents the percentage of weighted sections the user has seen,
 * NOT raw scroll position.
 *
 * This is completely independent from audio/listening progress.
 *
 * ## Terminal-state override at page bottom
 *
 * When the user reaches the absolute bottom of the page (within 4px), reading
 * progress is forced to 100% by marking every section as viewed.
 */
export function useReadingProgress(sections: SectionInfo[]) {
  const [viewedSections, setViewedSections] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const viewedRef = useRef<Set<string>>(new Set());

  // Set up the intersection observer
  useEffect(() => {
    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    viewedRef.current = new Set(viewedSections);

    // When the page doesn't scroll (content fits viewport exactly),
    // the IntersectionObserver initial callback may not detect all
    // sections (especially at the bottom edge).  Since the user can
    // see all content without scrolling, mark every section as viewed.
    //
    // IMPORTANT: the route content div is the real scroll container.
    //
    // Defer the noScroll check via requestAnimationFrame so the browser
    // has time to lay out the full page before measuring scrollHeight.
    // A synchronous check at mount time often sees scrollHeight == clientHeight
    // because dynamic content (images, maps) hasn't expanded yet, falsely
    // marking every section as viewed → progress jumps to 100%.
    const scrollEl = getAppScrollRoot();
    const frameId = requestAnimationFrame(() => {
      if (!scrollEl) return;
      const noScroll =
        scrollEl.scrollHeight <= scrollEl.clientHeight;
      if (noScroll && sections.length > 0) {
        const allIds = new Set(sections.map((s) => s.id));
        viewedRef.current = allIds;
        setViewedSections(new Set(allIds));
      }
    });

    // IntersectionObserver is used ONLY for tracking which sections have
    // been viewed (reading progress). TOC highlighting is handled by
    // useActiveSection so progress persistence cannot overwrite the active TOC item.
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const updatedViewed = new Set(viewedRef.current);

        for (const entry of entries) {
          const id = entry.target.id;
          if (!id) continue;

          if (entry.isIntersecting) {
            updatedViewed.add(id);
          }
          // If not intersecting but was already seen, keep it in viewed
        }

        // Update viewed sections if changed (state update batching is OK)
        if (
          updatedViewed.size !== viewedRef.current.size ||
          !setsEqual(updatedViewed, viewedRef.current)
        ) {
          viewedRef.current = updatedViewed;
          setViewedSections(new Set(updatedViewed));
        }
      },
      {
        root: scrollEl,
        rootMargin: '-80px 0px 0px 0px',
        threshold: 0,
      }
    );

    // Observe each section element
    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) {
        observerRef.current.observe(el);
      }
    }

    return () => {
      cancelAnimationFrame(frameId);
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  /* ─── Bottom-of-page terminal-state detector ───
   *
   * Listens to the real route scroll container. Once the user reaches the
   * absolute bottom (within BOTTOM_THRESHOLD px), all sections are marked
   * viewed so learning progress reaches 100%.
   *
   * Both updates are idempotent (no-op when state is already correct),
   * so subsequent scroll ticks don't cause render thrashing.
   */
  useEffect(() => {
    if (sections.length === 0) return;

    const BOTTOM_THRESHOLD_PX = 4;
    const allIds = new Set(sections.map((s) => s.id));
    const scrollEl = getAppScrollRoot();
    if (!scrollEl) return;

    const updateBottom = () => {
      const distanceToBottom =
        scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      const isAtBottom = distanceToBottom <= BOTTOM_THRESHOLD_PX;

      if (!isAtBottom) return;

      // Force all sections viewed → progress = 100%
      const allAlreadyViewed =
        viewedRef.current.size === allIds.size &&
        setsEqual(viewedRef.current, allIds);
      if (!allAlreadyViewed) {
        viewedRef.current = new Set(allIds);
        setViewedSections(new Set(allIds));
      }
    };

    // NOTE: updateBottom() is intentionally NOT called synchronously here.
    // A mount-time call would compare `viewedRef.current` (which may still
    // hold the PREVIOUS event's ids captured from React state) against the
    // NEW event's `allIds`, find them unequal, and force `setViewedSections`
    // to the full set — leaking 100% to the persisted state via the
    // saveProgress timer. Bottom-of-page detection is therefore handled
    // exclusively by the scroll/resize listeners below.
    scrollEl.addEventListener('scroll', updateBottom, { passive: true });
    // Resize can change scrollHeight; re-evaluate.
    window.addEventListener('resize', updateBottom, { passive: true });

    return () => {
      scrollEl.removeEventListener('scroll', updateBottom);
      window.removeEventListener('resize', updateBottom);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  // Reading progress — weighted fraction of viewed sections.
  // When the bottom-detector marks every section viewed, force 100% so the
  // database persistence layer records completion.
  const readingProgress = useMemo(() => {
    if (sections.length === 0) return 0;
    if (viewedSections.size === sections.length) return 100;
    return calculateWeightedProgress(sections, viewedSections);
  }, [sections, viewedSections]);

  const resetProgress = useCallback(() => {
    viewedRef.current = new Set();
    setViewedSections(new Set());
  }, [sections]);

  /** Set the initial viewed sections from saved progress, without scrolling. */
  const setInitialProgress = useCallback((initiallyViewed: Set<string>) => {
    viewedRef.current = new Set(initiallyViewed);
    setViewedSections(new Set(initiallyViewed));
  }, []);

  return {
    readingProgress,
    viewedSections,
    resetProgress,
    setInitialProgress,
  };
}

/** Calculate weighted progress from viewed sections. */
function calculateWeightedProgress(sections: SectionInfo[], viewed: Set<string>): number {
  const totalWeight = sections.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return 0;

  let viewedWeight = 0;
  for (const section of sections) {
    if (viewed.has(section.id)) {
      viewedWeight += section.weight;
    }
  }

  return Math.min(100, Math.round((viewedWeight / totalWeight) * 100));
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}
