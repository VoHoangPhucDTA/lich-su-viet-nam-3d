import { useCallback, useEffect, useRef } from 'react';

export function useObjectUrlRegistry() {
  const urls = useRef(new Map<string, string>());
  const revoked = useRef(new Set<string>());

  const revokeUrl = useCallback((url: string) => {
    if (revoked.current.has(url)) return;
    revoked.current.add(url);
    URL.revokeObjectURL(url);
  }, []);

  const revoke = useCallback((owner: string) => {
    const url = urls.current.get(owner);
    if (!url) return;
    urls.current.delete(owner);
    revokeUrl(url);
  }, [revokeUrl]);

  const create = useCallback((owner: string, file: File) => {
    const previous = urls.current.get(owner);
    const url = URL.createObjectURL(file);
    urls.current.set(owner, url);
    if (previous) requestAnimationFrame(() => revokeUrl(previous));
    return url;
  }, [revokeUrl]);

  const revokeAfterDetach = useCallback((owner: string) => {
    const url = urls.current.get(owner);
    if (!url) return;
    urls.current.delete(owner);
    requestAnimationFrame(() => revokeUrl(url));
  }, [revokeUrl]);

  const revokeAll = useCallback(() => {
    for (const url of urls.current.values()) revokeUrl(url);
    urls.current.clear();
  }, [revokeUrl]);

  useEffect(() => revokeAll, [revokeAll]);

  return { create, revoke, revokeAfterDetach, revokeAll };
}
