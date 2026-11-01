import * as v from 'valibot'

import { cookieItem } from './storage'

// Theme, mode and font (spec 5.7, 7.8): cookies the browser writes and SSR reads, so the first paint is right.

export const MODES = ['system', 'light', 'dark'] as const
export type Mode = (typeof MODES)[number]

/** Typeface sets of tokens.css `[data-font]` (DESIGN 4); `inter` is the default and needs no attribute. */
export const FONTS = [
  'inter',
  'geist',
  'google',
  'plex',
  'inter-tight',
  'sn-pro',
  'rubik',
  'ubuntu',
  'onest',
  'noto',
  'literata',
  'system',
] as const
export type Font = (typeof FONTS)[number]

const DEFAULT_THEME = 'modern-minimal'

// The slug becomes a URL path: only the shape of public/themes/<slug>.css names is accepted.
const vThemeSlug = v.pipe(v.string(), v.regex(/^[a-z0-9-]{1,64}$/))
const themeCookie = cookieItem('ab_theme', vThemeSlug)
const modeCookie = cookieItem('ab_mode', v.picklist(MODES))
const fontCookie = cookieItem('ab_font', v.picklist(FONTS))

/**
 * `profileTheme`: the signed-in user's `theme` (null = the default), absent for a guest. The account's theme wins over
 * this browser's cookie, so it follows the user to any device and never comes from a previous account (BUG-362/380).
 */
export function readAppearance(profileTheme?: string | null): { theme: string; mode: Mode; font: Font } {
  const theme = profileTheme === undefined ? themeCookie.get() : v.is(vThemeSlug, profileTheme) ? profileTheme : null
  return { theme: theme ?? DEFAULT_THEME, mode: modeCookie.get() ?? 'system', font: fontCookie.get() ?? 'inter' }
}

export const themeHref = (theme: string) => `/themes/${theme}.css`

/** `<html data-mode>`: absent for "system", so the media query in tokens.css decides. */
export const modeAttribute = (mode: Mode) => (mode === 'system' ? undefined : mode)

/** `<html data-font>`: absent for the default set. */
export const fontAttribute = (font: Font) => (font === 'inter' ? undefined : font)

/** Swaps the open document's theme stylesheet (RootDocument's link) without saving: a preview. */
export function showTheme(theme: string): void {
  document.documentElement.dataset['theme'] = theme
  document.querySelector('link[href^="/themes/"]')?.setAttribute('href', themeHref(theme))
}

/** Applies the mode to the open document without saving: a preview. */
export function showMode(mode: Mode): void {
  const attribute = modeAttribute(mode)
  if (attribute) document.documentElement.dataset['mode'] = attribute
  else delete document.documentElement.dataset['mode']
}

/** Applies the font set to the open document without saving: a preview. */
export function showFont(font: Font): void {
  const attribute = fontAttribute(font)
  if (attribute) document.documentElement.dataset['font'] = attribute
  else delete document.documentElement.dataset['font']
}

/** Saves the theme and shows it at once. */
export function saveTheme(theme: string): void {
  themeCookie.set(theme)
  showTheme(theme)
}

/** Saves the mode and applies it to the open document at once (SSR applies it on the next load). */
export function saveMode(mode: Mode): void {
  modeCookie.set(mode)
  showMode(mode)
}

/** Saves the font set (this browser only, like the mode) and applies it at once. */
export function saveFont(font: Font): void {
  fontCookie.set(font)
  showFont(font)
}
