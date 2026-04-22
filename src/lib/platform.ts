export function isMobileWidth(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768
}
