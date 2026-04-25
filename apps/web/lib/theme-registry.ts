import rawThemeRegistry from './theme-registry.generated.json';

export type ThemeMode = 'light' | 'dark';
export type ThemeTokenMap = Record<string, string>;

export interface ThemeColors {
  readonly background: string;
  readonly foreground: string;
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
}

export interface ThemeDefinition {
  readonly name: string;
  readonly tokens: Readonly<ThemeTokenMap>;
  readonly colors: Readonly<ThemeColors>;
  readonly resolvedTheme: ThemeMode;
}

export const THEME_STORAGE_KEY = 'theme';
export const DEFAULT_THEME_NAME = 'default';

const registry = rawThemeRegistry as Record<string, ThemeTokenMap>;

function normalizeThemeTokens(tokens: ThemeTokenMap): ThemeTokenMap {
  const merged: ThemeTokenMap = {
    ...tokens,
  };

  if (!merged['letter-spacing'] && merged['tracking-normal']) {
    merged['letter-spacing'] = merged['tracking-normal'];
  }

  if (!merged['tracking-normal'] && merged['letter-spacing']) {
    merged['tracking-normal'] = merged['letter-spacing'];
  }

  const shadowX = merged['shadow-offset-x'] ?? merged['shadow-x'];
  const shadowY = merged['shadow-offset-y'] ?? merged['shadow-y'];

  if (shadowX) {
    merged['shadow-x'] = shadowX;
    merged['shadow-offset-x'] = shadowX;
  }

  if (shadowY) {
    merged['shadow-y'] = shadowY;
    merged['shadow-offset-y'] = shadowY;
  }

  return merged;
}

const defaultThemeTokens = normalizeThemeTokens(registry[DEFAULT_THEME_NAME] ?? {});

function buildThemeDefinition(name: string, partialTokens: ThemeTokenMap): ThemeDefinition {
  const tokens = normalizeThemeTokens({
    ...defaultThemeTokens,
    ...partialTokens,
  });
  const background = tokens.background ?? defaultThemeTokens.background ?? 'oklch(1 0 0)';
  const foreground = tokens.foreground ?? defaultThemeTokens.foreground ?? 'oklch(0.145 0 0)';
  const primary = tokens.primary ?? defaultThemeTokens.primary ?? foreground;
  const secondary = tokens.secondary ?? defaultThemeTokens.secondary ?? background;
  const accent = tokens.accent ?? defaultThemeTokens.accent ?? secondary;

  return {
    name,
    tokens,
    colors: {
      background,
      foreground,
      primary,
      secondary,
      accent,
    },
    resolvedTheme: inferThemeMode(background),
  };
}

function hexToRgb(value: string) {
  const hex = value.replace('#', '').trim();
  if (![3, 6].includes(hex.length)) return null;

  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : hex;

  const intValue = Number.parseInt(normalized, 16);
  if (Number.isNaN(intValue)) return null;

  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255,
  };
}

function rgbToLuminance(r: number, g: number, b: number) {
  const channels = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const [rs = 0, gs = 0, bs = 0] = channels;

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function inferThemeMode(background: string | undefined): ThemeMode {
  if (!background) return 'light';

  const value = background.trim().toLowerCase();

  const oklchMatch = value.match(/^oklch\(\s*([0-9.]+)/);
  if (oklchMatch?.[1]) {
    return Number.parseFloat(oklchMatch[1]) < 0.62 ? 'dark' : 'light';
  }

  const hslMatch = value.match(/^hsla?\(\s*[-0-9.]+\s+[-0-9.]+%?\s+([-0-9.]+)%/);
  if (hslMatch?.[1]) {
    return Number.parseFloat(hslMatch[1]) < 50 ? 'dark' : 'light';
  }

  const rgbMatch = value.match(/^rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)/);
  if (rgbMatch?.[1] && rgbMatch[2] && rgbMatch[3]) {
    const luminance = rgbToLuminance(
      Number.parseFloat(rgbMatch[1]),
      Number.parseFloat(rgbMatch[2]),
      Number.parseFloat(rgbMatch[3]),
    );
    return luminance < 0.34 ? 'dark' : 'light';
  }

  if (value.startsWith('#')) {
    const rgb = hexToRgb(value);
    if (rgb) {
      return rgbToLuminance(rgb.r, rgb.g, rgb.b) < 0.34 ? 'dark' : 'light';
    }
  }

  return 'light';
}

export const themes = Object.entries(registry).map(([name, tokens]) => buildThemeDefinition(name, tokens));
export const themeNames = themes.map((theme) => theme.name);
export const darkThemeNames = themes.filter((theme) => theme.resolvedTheme === 'dark').map((theme) => theme.name);

const themeMap = new Map(themes.map((theme) => [theme.name, theme] as const));

export function getTheme(name: string): ThemeDefinition {
  return themeMap.get(name) ?? themeMap.get(DEFAULT_THEME_NAME) ?? buildThemeDefinition(DEFAULT_THEME_NAME, {});
}

export function getStoredTheme(): string | null {
  if (typeof window === 'undefined') return null;
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme && themeMap.has(storedTheme) ? storedTheme : null;
}

export function applyTheme(theme: ThemeDefinition): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.setAttribute('data-theme', theme.name);
  root.setAttribute('data-mode', theme.resolvedTheme);
  root.classList.toggle('dark', theme.resolvedTheme === 'dark');
  root.style.colorScheme = theme.resolvedTheme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme.name);
}

export function isDarkThemeName(themeName: string): boolean {
  return getTheme(themeName).resolvedTheme === 'dark';
}
