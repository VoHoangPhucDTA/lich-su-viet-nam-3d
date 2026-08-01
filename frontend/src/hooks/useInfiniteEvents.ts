import { useCallback, useEffect, useRef, useState } from 'react';
import { getBrowseEvents, type BrowseEventsParams } from '../services/eventApi';
import type { HistoricalEvent } from '../types/event';

interface UseInfiniteEventsOptions extends BrowseEventsParams {
  enabled?: boolean;
  limit?: number;
}

export function useInfiniteEvents(options: UseInfiniteEventsOptions) {
  const { enabled = true, limit = 24, ...params } = options;
  const requestKey = JSON.stringify({ ...params, limit });
  const [events, setEvents] = useState<HistoricalEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [hasMore, setHasMore] = useState(false);
  const requestIdRef = useRef(0);
  const loadingRef = useRef(false);
  const offsetRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const paramsRef = useRef(params);

  paramsRef.current = params;

  const loadPage = useCallback(async (reset: boolean) => {
    if (!enabled || loadingRef.current) return;
    loadingRef.current = true;
    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    const pageOffset = reset ? 0 : offsetRef.current;
    setError(null);
    if (reset) setIsInitialLoading(true);
    else setIsLoadingMore(true);

    try {
      const result = await getBrowseEvents(
        { ...paramsRef.current, limit, offset: pageOffset },
        { signal: controller.signal }
      );
      if (requestId !== requestIdRef.current) return;
      setEvents((current) => {
        if (reset) return result.events;
        const seen = new Set(current.map((event) => event.id));
        return [...current, ...result.events.filter((event) => !seen.has(event.id))];
      });
      const nextOffset = pageOffset + result.events.length;
      offsetRef.current = nextOffset;
      setOffset(nextOffset);
      setTotal(result.total);
      setHasMore(result.hasMore && result.events.length > 0);
    } catch (requestError) {
      const aborted = requestError instanceof DOMException && requestError.name === 'AbortError';
      if (requestId === requestIdRef.current && !aborted) setError(requestError);
    } finally {
      if (requestId === requestIdRef.current) {
        controllerRef.current = null;
        loadingRef.current = false;
        setIsInitialLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [enabled, limit]);

  useEffect(() => {
    requestIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    loadingRef.current = false;
    offsetRef.current = 0;
    setEvents([]);
    setTotal(0);
    setOffset(0);
    setHasMore(false);
    setError(null);
    if (enabled) void loadPage(true);
  }, [enabled, loadPage, requestKey]);

  const retry = useCallback(() => {
    void loadPage(events.length === 0);
  }, [events.length, loadPage]);

  const loadMore = useCallback(() => {
    if (!hasMore) return;
    void loadPage(false);
  }, [hasMore, loadPage]);

  return {
    events,
    total,
    offset,
    hasMore,
    isInitialLoading,
    isLoadingMore,
    error,
    loadMore,
    retry,
  };
}
