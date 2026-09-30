/**
 * Zitadel's password complexity policy (UX-201). Its classes are ASCII-only:
 * upper `[A-Z]`, lower `[a-z]`, digit `[0-9]`, symbol `[^A-Za-z0-9]` — a
 * Cyrillic letter counts as a symbol, never as an upper- or lower-case letter.
 * Length is checked separately.
 */
export const meetsPasswordPolicy = (password: string) =>
  [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].every(re => re.test(password))
