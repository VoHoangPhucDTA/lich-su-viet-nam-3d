import { useEffect, useRef, useState, useCallback } from 'react';

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
 */
export function useReadingProgress(sections: SectionInfo[]) {
  const [viewedSections, setViewedSections] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<string>(sections[0]?.id ?? '');
  const observerRef = useRef<IntersectionObserver | null>(null);
  const viewedRef = useRef<Set<string>>(new Set());

  // Calculate reading progress from weighted sections
  const readingProgress = sections.length > 0
    ? calculateWeightedProgress(sections, viewedSections)
    : 0;

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
    const noScroll =
      document.documentElement.scrollHeight <= document.documentElement.clientHeight;
    if (noScroll && sections.length > 0) {
      const allIds = new Set(sections.map((s) => s.id));
      viewedRef.current = allIds;
      setViewedSections(new Set(allIds));
      setActiveSection(sections[0].id);
      return; // Skip observer setup – all sections viewed
    }

    // Use a ref for active section to avoid stale closures in IntersectionObserver callback
    const activeSectionRef = { current: activeSection };

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const updatedViewed = new Set(viewedRef.current);
        let topVisible = activeSectionRef.current;

        for (const entry of entries) {
          const id = entry.target.id;
          if (!id) continue;

          if (entry.isIntersecting) {
            updatedViewed.add(id);
            // Track the topmost visible section
            if (entry.boundingClientRect.top >= 0 && entry.boundingClientRect.top < 500) {
              topVisible = id;
            }
          }
          // If not intersecting but was already seen, keep it in viewed
        }

        // Update viewed sections if changed
        if (updatedViewed.size !== viewedRef.current.size || !setsEqual(updatedViewed, viewedRef.current)) {
          viewedRef.current = updatedViewed;
          setViewedSections(new Set(updatedViewed));
        }

        // Update active section if changed
        if (topVisible && topVisible !== activeSectionRef.current) {
          activeSectionRef.current = topVisible;
          setActiveSection(topVisible);
        }
      },
      {
        // Top: -80px accounts for the sticky header.
        // Bottom: 0px means sections at the bottom of the page are
        // detectable when the user scrolls to the page end.
        rootMargin: '-80px 0px 0px 0px',
        threshold: [0, 0.25, 0.5],
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
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
    // Deliberately only re-run when sections change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  const resetProgress = useCallback(() => {
    viewedRef.current = new Set();
    setViewedSections(new Set());
  }, []);

  return {
    readingProgress,
    viewedSections,
    activeSection,
    resetProgress,
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
