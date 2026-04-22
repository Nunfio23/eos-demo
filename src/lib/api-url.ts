/**
 * Returns the correct base URL for API calls.
 * - Web (Vercel): '' → relative URLs like /api/...
 * - Mobile (Capacitor static build): 'https://eos-school.app' → absolute URLs
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? ''

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}
