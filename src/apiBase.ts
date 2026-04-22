/**
 * Shared API base URL resolver.
 * Used by api.ts and tts.ts to avoid duplication.
 */
export function getApiBase(): string {
  const envUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
  if (envUrl) {
    return envUrl;
  }

  const { protocol, hostname, port } = window.location;

  if (port === '4173') {
    return `${protocol}//${hostname}:8787`;
  }

  if (!port || port === '80' || port === '443') {
    return '';
  }

  return '';
}
