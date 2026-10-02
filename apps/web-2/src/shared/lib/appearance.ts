import * as v from 'valibot'

import { cookieItem } from './storage'

// Theme and mode (spec 5.7, 7.8): cookies the browser writes and SSR reads, so the first paint is right.

export const MODES = ['system', 'light', 'dark'] as const
export type Mode = (typeof MODES)[number]

const DEFAULT_THEME = 'modern-minimal'

// The slug becomes a URL path: only the shape of public/themes/<slug>.css names is accepted.
const themeCookie = cookieItem('ab_theme', v.pipe(v.string(), v.regex(/^[a-z0-9-]{1,64}$/)))
const modeCookie = cookieItem('ab_mode', v.picklist(MODES))

export function readAppearance(): { theme: string; mode: Mode } {
  return { theme: themeCookie.get() ?? DEFAULT_THEME, mode: modeCookie.get() ?? 'system' }
}

export const themeHref = (theme: string) => `/themes/${theme}.css`

/** `<html data-mode>`: absent for "system", so the media query in tokens.css decides. */
export const modeAttribute = (mode: Mode) => (mode === 'system' ? undefined : mode)

/** Saves the mode and applies it to the open document at once (SSR applies it on the next load). */
export function saveMode(mode: Mode): void {
  modeCookie.set(mode)
  const attribute = modeAttribute(mode)
  if (attribute) document.documentElement.dataset['mode'] = attribute
  else delete document.documentElement.dataset['mode']
}
