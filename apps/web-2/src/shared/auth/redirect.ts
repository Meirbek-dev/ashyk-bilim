const FALLBACK = '/home'

/** The `redirect` search param accepts only same-origin paths; anything else lands on /home. */
export function safeRedirect(value: string | undefined): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return FALLBACK
  // A path that parses to another origin (e.g. "/\t/evil.example") is rejected too.
  return new URL(value, 'http://internal.invalid').origin === 'http://internal.invalid' ? value : FALLBACK
}
