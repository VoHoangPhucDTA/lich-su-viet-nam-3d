import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

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
 * ## Active section selection
 *
 * The currently-active section (used to highlight the TOC) is the section
 * with the **highest `intersectionRatio`** among all observed sections.
 * Earlier-index sections win ties. This handles multi-intersection edge
 * cases where a mid-page section is fading out while the next is fading in:
 * the section occupying the largest viewport share is dominant.
 *
 * ## Terminal-state override at page bottom
 *
 * When the user reaches the absolute bottom of the page (within 4px), two
 * terminal states are forced deterministically:
 *
 * 1. Reading progress = 100% (all sections marked viewed).
 * 2. Active section = last section id.
 *
 * Once both are committed, the bottom-detector scroll listener
 * handles the terminal state deterministically.
 */
export function useReadingProgress(sections: SectionInfo[]) {
  const [viewedSections, setViewedSections] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<string>(sections[0]?.id ?? '');
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
    // IMPORTANT: use `document.body` (not `document.documentElement`)
    // because the app's CSS sets `body { overflow-y: auto; height: 100% }`,
    // making `body` the actual scroll container.
    //
    // Defer the noScroll check via requestAnimationFrame so the browser
    // has time to lay out the full page before measuring scrollHeight.
    // A synchronous check at mount time often sees scrollHeight == clientHeight
    // because dynamic content (images, maps) hasn't expanded yet, falsely
    // marking every section as viewed → progress jumps to 100%.
    const scrollEl = document.body;
    const frameId = requestAnimationFrame(() => {
      const noScroll =
        scrollEl.scrollHeight <= scrollEl.clientHeight;
      if (noScroll && sections.length > 0) {
        const allIds = new Set(sections.map((s) => s.id));
        viewedRef.current = allIds;
        setViewedSections(new Set(allIds));
        setActiveSection(sections[0].id);
      }
    });

    // IntersectionObserver is used ONLY for tracking which sections have
    // been viewed (reading progress). The activeSection for TOC highlighting
    // is handled exclusively by the closest-to-top scroll listener below —
    // this eliminates races between the observer's ratio-based selection and
    // the deterministic scroll-position logic.
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

  /* ─── Closest-to-top active-section tracker ───
 *
 * Listens on both `window` and `document.body` because the app's CSS makes
 * `body` the actual scroll container (see index.css).
 */
  useEffect(() => {
    if (sections.length === 0) return;

    const updateActiveSection = () => {
      let bestSection = sections[0].id;
      let bestTop = window.innerHeight;

      for (const section of sections) {
        const el = document.getElementById(section.id);
        if (!el) continue;

        const rect = el.getBoundingClientRect();
        // Section's top is within the viewport or just barely past it.
        if (rect.top > -100 && rect.top < bestTop) {
          bestTop = rect.top;
          bestSection = section.id;
        }
      }

      setActiveSection(bestSection);
    };

    updateActiveSection();
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    document.body.addEventListener('scroll', updateActiveSection, { passive: true });
    return () => {
      window.removeEventListener('scroll', updateActiveSection);
      document.body.removeEventListener('scroll', updateActiveSection);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  /* ─── Bottom-of-page terminal-state detector ───
   *
   * Listens to both `window` and `document.body` because the app's CSS
   * makes `body` the actual scroll container. Forces two terminal states
   * once the user reaches the absolute bottom (within BOTTOM_THRESHOLD px):
   *
   *   1. `viewedSections` = ALL section ids   → progress = 100%
   *   2. `activeSection`  = last section id  → TOC highlights the last item
   *
   * Both updates are idempotent (no-op when state is already correct),
   * so subsequent scroll ticks don't cause render thrashing.
   */
  useEffect(() => {
    if (sections.length === 0) return;

    const BOTTOM_THRESHOLD_PX = 4;
    const lastSectionId = sections[sections.length - 1].id;
    const allIds = new Set(sections.map((s) => s.id));

    const updateBottom = () => {
      const body = document.body;
      const docEl = document.documentElement;
      const scrollTop =
        body.scrollTop || docEl.scrollTop || window.scrollY || 0;
      const scrollHeight = Math.max(
        body.scrollHeight,
        docEl.scrollHeight,
        body.offsetHeight,
        docEl.offsetHeight
      );
      const clientHeight = window.innerHeight || 0;
      const distanceToBottom = scrollHeight - scrollTop - clientHeight;
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

      // Force last section active (source of truth at bottom)
      setActiveSection((prev) => (prev === lastSectionId ? prev : lastSectionId));
    };

    // NOTE: updateBottom() is intentionally NOT called synchronously here.
    // A mount-time call would compare `viewedRef.current` (which may still
    // hold the PREVIOUS event's ids captured from React state) against the
    // NEW event's `allIds`, find them unequal, and force `setViewedSections`
    // to the full set — leaking 100% to the persisted state via the
    // saveProgress timer. Bottom-of-page detection is therefore handled
    // exclusively by the scroll/resize listeners below.
    window.addEventListener('scroll', updateBottom, { passive: true });
    document.body.addEventListener('scroll', updateBottom, { passive: true });
    // Resize can change scrollHeight; re-evaluate.
    window.addEventListener('resize', updateBottom, { passive: true });

    return () => {
      window.removeEventListener('scroll', updateBottom);
      document.body.removeEventListener('scroll', updateBottom);
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
    // Reset active section synchronously so the TOC doesn't briefly
    // highlight a stale section from the previous event while waiting
    // for the IntersectionObserver's first async callback.
    setActiveSection(sections[0]?.id ?? '');
  }, [sections]);

  /** Set the initial viewed sections from saved progress, without scrolling. */
  const setInitialProgress = useCallback((initiallyViewed: Set<string>) => {
    viewedRef.current = new Set(initiallyViewed);
    setViewedSections(new Set(initiallyViewed));
    // Anchor the TOC highlight on the last viewed section in reading order.
    // Otherwise the TOC briefly highlights the wrong section on restore
    // (typically the first section) until the IntersectionObserver's first
    // async callback fires and re-picks based on ratio.
    let lastViewedId = sections[0]?.id ?? '';
    for (const section of sections) {
      if (initiallyViewed.has(section.id)) {
        lastViewedId = section.id;
      }
    }
    setActiveSection(lastViewedId);
  }, [sections]);

  return {
    readingProgress,
    viewedSections,
    activeSection,
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
