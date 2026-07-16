import { useCallback, useEffect, useRef, useState } from 'react';
import type { SectionInfo } from './useReadingProgress';

export const APP_SCROLL_ROOT_ID = 'app-scroll-root';
export const EVENT_DETAIL_SECTION_OFFSET_PX = 140;
const BOTTOM_THRESHOLD_PX = 4;
const TARGET_THRESHOLD_PX = 3;

type ProgrammaticTarget = {
  sectionId: string;
  top?: boolean;
};

export function getAppScrollRoot(): HTMLElement | null {
  return document.getElementById(APP_SCROLL_ROOT_ID);
}

export function useActiveSection(
  sections: SectionInfo[],
  offsetPx = EVENT_DETAIL_SECTION_OFFSET_PX
) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? '');
  const programmaticTargetRef = useRef<ProgrammaticTarget | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const stopMonitoring = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const isAtBottom = useCallback((root: HTMLElement) => {
    return root.scrollHeight - root.scrollTop - root.clientHeight <= BOTTOM_THRESHOLD_PX;
  }, []);

  const getActiveFromScrollPosition = useCallback(() => {
    if (sections.length === 0) return '';

    const root = getAppScrollRoot();
    if (!root) return sections[0].id;

    if (isAtBottom(root)) {
      return sections[sections.length - 1].id;
    }

    const anchorTop = root.getBoundingClientRect().top + offsetPx;
    let activeId = sections[0].id;
    let closestDistance = Number.POSITIVE_INFINITY;
    let closestTop = Number.NEGATIVE_INFINITY;

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (!el) continue;

      const top = el.getBoundingClientRect().top;
      const distance = Math.abs(top - anchorTop);

      if (
        distance < closestDistance ||
        (distance === closestDistance && top > closestTop)
      ) {
        closestDistance = distance;
        closestTop = top;
        activeId = section.id;
      }
    }

    return activeId;
  }, [isAtBottom, offsetPx, sections]);

  const updateFromScrollPosition = useCallback(() => {
    const target = programmaticTargetRef.current;
    if (target) {
      setActiveSection((prev) => (prev === target.sectionId ? prev : target.sectionId));
      return;
    }

    const next = getActiveFromScrollPosition();
    setActiveSection((prev) => (prev === next ? prev : next));
  }, [getActiveFromScrollPosition]);

  const releaseProgrammaticTarget = useCallback(() => {
    programmaticTargetRef.current = null;
    stopMonitoring();
    const next = getActiveFromScrollPosition();
    setActiveSection((prev) => (prev === next ? prev : next));
  }, [getActiveFromScrollPosition, stopMonitoring]);

  const targetHasSettled = useCallback((root: HTMLElement, target: ProgrammaticTarget) => {
    if (target.top) {
      return root.scrollTop <= TARGET_THRESHOLD_PX;
    }

    if (isAtBottom(root)) {
      return true;
    }

    const el = document.getElementById(target.sectionId);
    if (!el) return true;

    const anchorTop = root.getBoundingClientRect().top + offsetPx;
    return Math.abs(el.getBoundingClientRect().top - anchorTop) <= TARGET_THRESHOLD_PX;
  }, [isAtBottom, offsetPx]);

  const monitorProgrammaticScroll = useCallback(() => {
    stopMonitoring();

    const tick = () => {
      const root = getAppScrollRoot();
      const target = programmaticTargetRef.current;

      if (!root || !target) {
        stopMonitoring();
        return;
      }

      if (targetHasSettled(root, target)) {
        releaseProgrammaticTarget();
        return;
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  }, [releaseProgrammaticTarget, stopMonitoring, targetHasSettled]);

  const scrollToSection = useCallback((sectionId: string) => {
    const root = getAppScrollRoot();
    const el = document.getElementById(sectionId);
    if (!root || !el) return;

    programmaticTargetRef.current = { sectionId };
    setActiveSection(sectionId);

    const nextTop =
      root.scrollTop +
      el.getBoundingClientRect().top -
      root.getBoundingClientRect().top -
      offsetPx;

    root.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
    monitorProgrammaticScroll();
  }, [monitorProgrammaticScroll, offsetPx]);

  const scrollToTop = useCallback(() => {
    const root = getAppScrollRoot();
    if (!root) return;

    const firstSectionId = sections[0]?.id ?? '';
    if (firstSectionId) {
      programmaticTargetRef.current = { sectionId: firstSectionId, top: true };
      setActiveSection(firstSectionId);
    }

    root.scrollTo({ top: 0, behavior: 'smooth' });
    monitorProgrammaticScroll();
  }, [monitorProgrammaticScroll, sections]);

  useEffect(() => {
    const root = getAppScrollRoot();
    if (!root || sections.length === 0) return;

    const releaseOnUserScroll = () => {
      if (programmaticTargetRef.current) {
        releaseProgrammaticTarget();
      }
    };

    const releaseOnKey = (event: KeyboardEvent) => {
      if (
        ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)
      ) {
        releaseOnUserScroll();
      }
    };

    root.addEventListener('scroll', updateFromScrollPosition, { passive: true });
    root.addEventListener('wheel', releaseOnUserScroll, { passive: true });
    root.addEventListener('touchstart', releaseOnUserScroll, { passive: true });
    window.addEventListener('resize', updateFromScrollPosition, { passive: true });
    window.addEventListener('keydown', releaseOnKey);

    const frameId = requestAnimationFrame(updateFromScrollPosition);

    return () => {
      cancelAnimationFrame(frameId);
      stopMonitoring();
      root.removeEventListener('scroll', updateFromScrollPosition);
      root.removeEventListener('wheel', releaseOnUserScroll);
      root.removeEventListener('touchstart', releaseOnUserScroll);
      window.removeEventListener('resize', updateFromScrollPosition);
      window.removeEventListener('keydown', releaseOnKey);
    };
  }, [releaseProgrammaticTarget, sections.length, stopMonitoring, updateFromScrollPosition]);

  useEffect(() => {
    setActiveSection(sections[0]?.id ?? '');
    programmaticTargetRef.current = null;
    stopMonitoring();
  }, [sections, stopMonitoring]);

  return {
    activeSection,
    scrollToSection,
    scrollToTop,
  };
}
