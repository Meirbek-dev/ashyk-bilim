import rawThemeRegistry from './theme-store.json'
import { loadThemeFonts } from './theme-fonts'
import {
  readLocalStorageString,
  writeJsonLocalStorage,
  writeLocalStorageString,
} from './local-storage'

export type ThemeMode = 'light' | 'dark'
export type ThemeTokenMap = Record<string, string>
export type ThemeStyles = Record<ThemeMode, ThemeTokenMap>

export interface ThemeColors {
  readonly background: string
  readonly foreground: string
  readonly primary: string
  readonly secondary: string
  readonly accent: string
}

export interface ThemePreset {
  readonly label?: string
  readonly styles: {
    readonly light: ThemeTokenMap
    readonly dark: ThemeTokenMap
  }
}

export interface ThemeDefinition {
  readonly name: string
  readonly label: string
  readonly styles: Readonly<ThemeStyles>
  readonly tokens: Readonly<ThemeTokenMap>
  readonly colors: Readonly<ThemeColors>
  readonly resolvedTheme: ThemeMode
}

export const THEME_STORAGE_KEY = 'theme'
export const THEME_MODE_STORAGE_KEY = 'theme-mode'
export const THEME_CACHE_STORAGE_KEY = 'theme-cache'
export const DEFAULT_THEME_NAME = 'modern-minimal'
export const DEFAULT_THEME_MODE: ThemeMode = 'light'
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

interface ShadcnRegistryItem {
  name: string
  title?: string
  cssVars: {
    theme?: Record<string, string>
    light: Record<string, string>
    dark: Record<string, string>
  }
}

const rawRegistry = rawThemeRegistry as unknown as {
  items?: ShadcnRegistryItem[]
}

interface CachedThemePayload {
  name: string
  tokensByMode: ThemeStyles
}

// Merge `theme` (shared) block into both light and dark so every preset is self-contained.
const registry: Record<string, ThemePreset> = Object.fromEntries(
  (rawRegistry.items ?? []).map(item => [
    item.name,
    {
      label: item.title,
      styles: {
        light: { ...item.cssVars.theme, ...item.cssVars.light },
        dark: { ...item.cssVars.theme, ...item.cssVars.dark },
      },
    },
  ]),
)

function buildColors(tokens: ThemeTokenMap): ThemeColors {
  const bg = tokens.background ?? 'oklch(1 0 0)'
  const fg = tokens.foreground ?? 'oklch(0.145 0 0)'
  return {
    background: bg,
    foreground: fg,
    primary: tokens.primary ?? fg,
    secondary: tokens.secondary ?? bg,
    accent: tokens.accent ?? tokens.secondary ?? bg,
  }
}

function buildThemeDefinition(name: string, preset: ThemePreset, mode: ThemeMode): ThemeDefinition {
  const tokens = mode === 'dark' ? preset.styles.dark : preset.styles.light
  return {
    name,
    label: preset.label ?? name,
    styles: preset.styles,
    tokens,
    colors: buildColors(tokens),
    resolvedTheme: mode,
  }
}

function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === 'light' || value === 'dark'
}

export const themeNames = Object.keys(registry)
export const themes = themeNames.map(name =>
  buildThemeDefinition(name, registry[name]!, DEFAULT_THEME_MODE),
)

export function getTheme(name: string, mode: ThemeMode = DEFAULT_THEME_MODE): ThemeDefinition {
  const resolvedName = name in registry ? name : DEFAULT_THEME_NAME
  return buildThemeDefinition(resolvedName, registry[resolvedName]!, mode)
}

export function getStoredTheme(): string | null {
  if (typeof globalThis.window === 'undefined') return null
  const stored = readLocalStorageString(THEME_STORAGE_KEY, themeNames)
  return stored && stored in registry ? stored : null
}

export function getStoredThemeMode(): ThemeMode | null {
  if (typeof globalThis.window === 'undefined') return null
  return readLocalStorageString(THEME_MODE_STORAGE_KEY, ['light', 'dark']) as ThemeMode | null
}

export function getSystemThemeMode(): ThemeMode {
  if (typeof globalThis.window === 'undefined') return DEFAULT_THEME_MODE
  return globalThis.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyThemeToElement(theme: ThemeDefinition, root: HTMLElement): void {
  for (const [key, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(`--${key}`, value)
  }
  root.setAttribute('data-theme', theme.name)
  root.setAttribute('data-mode', theme.resolvedTheme)
  root.classList.toggle('dark', theme.resolvedTheme === 'dark')
  root.style.colorScheme = theme.resolvedTheme
}

export function persistTheme(theme: ThemeDefinition): void {
  if (typeof globalThis.window === 'undefined') return

  const cachedTheme = {
    name: theme.name,
    tokensByMode: {
      light: getTheme(theme.name, 'light').tokens,
      dark: getTheme(theme.name, 'dark').tokens,
    },
  }

  writeLocalStorageString(THEME_STORAGE_KEY, theme.name)
  writeLocalStorageString(THEME_MODE_STORAGE_KEY, theme.resolvedTheme)
  writeJsonLocalStorage(THEME_CACHE_STORAGE_KEY, cachedTheme)
  document.cookie = `${THEME_STORAGE_KEY}=${encodeURIComponent(theme.name)}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`
  document.cookie = `${THEME_MODE_STORAGE_KEY}=${theme.resolvedTheme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`
}

export function applyTheme(theme: ThemeDefinition, options: { persist?: boolean } = {}): void {
  if (typeof document === 'undefined') return
  applyThemeToElement(theme, document.documentElement)
  loadThemeFonts(theme.tokens)
  if (options.persist ?? true) persistTheme(theme)
}
