interface EventDetailNavigationState {
  returnTo?: unknown;
  from?: unknown;
}

function navigationState(state: unknown): EventDetailNavigationState {
  return state && typeof state === 'object'
    ? state as EventDetailNavigationState
    : {};
}

function isMapLocation(value: unknown): value is string {
  return typeof value === 'string' && (value === '/map' || value.startsWith('/map?'));
}

export function isSafeInternalLocation(value: unknown): value is string {
  return typeof value === 'string'
    && value.startsWith('/')
    && !value.startsWith('//')
    && !value.includes('\\');
}

export function resolveMapReturnLocation(state: unknown): string | null {
  const { returnTo } = navigationState(state);
  return isMapLocation(returnTo) ? returnTo : null;
}

export function resolveLegacyFromLocation(state: unknown): string | null {
  const { from } = navigationState(state);
  return isSafeInternalLocation(from) ? from : null;
}

export function resolveEventDetailBackTarget(
  state: unknown,
  hasPreviousEntry: boolean,
): string | -1 {
  return resolveMapReturnLocation(state)
    ?? resolveLegacyFromLocation(state)
    ?? (hasPreviousEntry ? -1 : '/home');
}

export function resolveEventDetailErrorTarget(state: unknown): string {
  return resolveMapReturnLocation(state)
    ?? resolveLegacyFromLocation(state)
    ?? '/home';
}
