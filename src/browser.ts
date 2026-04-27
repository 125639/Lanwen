export function matchesMediaQuery(query: string, fallback = false): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return fallback;
  }

  return window.matchMedia(query).matches;
}

export function subscribeToMediaQuery(
  query: string,
  onChange: (matches: boolean) => void,
): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }

  const mediaQueryList = window.matchMedia(query);
  const listener = (event: MediaQueryListEvent) => {
    onChange(event.matches);
  };

  if (typeof mediaQueryList.addEventListener === 'function') {
    mediaQueryList.addEventListener('change', listener);
    return () => mediaQueryList.removeEventListener('change', listener);
  }

  mediaQueryList.addListener(listener);
  return () => mediaQueryList.removeListener(listener);
}

export function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized.endsWith('.localhost')
  );
}
