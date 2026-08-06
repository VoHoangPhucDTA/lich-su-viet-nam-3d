export function safeAdminUsersReturnLocation(value: unknown) {
  if (!value || typeof value !== 'object' || !('from' in value) || typeof value.from !== 'string') {
    return '/admin/users';
  }
  const candidate = value.from;
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return '/admin/users';
  try {
    const parsed = new URL(candidate, window.location.origin);
    if (parsed.origin !== window.location.origin || parsed.pathname !== '/admin/users') {
      return '/admin/users';
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return '/admin/users';
  }
}
