const DEFAULT_FONT_WEIGHTS = ['400', '500', '600', '700'] as const;

const SYSTEM_FONTS = new Set([
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
  '-apple-system',
  'blinkmacsystemfont',
]);

const loadedFontUrls = new Set<string>();

export function extractFontFamily(fontFamilyValue: string | undefined): string | null {
  if (!fontFamilyValue) return null;

  const [firstFont] = fontFamilyValue.split(',');
  const cleanFont = firstFont?.trim().replace(/['"]/g, '');

  if (!cleanFont || SYSTEM_FONTS.has(cleanFont.toLowerCase())) return null;
  return cleanFont;
}

export function buildFontCssUrl(family: string, weights: readonly string[] = DEFAULT_FONT_WEIGHTS): string {
  const encodedFamily = encodeURIComponent(family);
  return `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${weights.join(',')}&display=swap`;
}

export function loadGoogleFont(family: string, weights: readonly string[] = DEFAULT_FONT_WEIGHTS): void {
  if (typeof document === 'undefined') return;

  const href = buildFontCssUrl(family, weights);
  if (loadedFontUrls.has(href) || document.querySelector(`link[href="${href}"]`)) {
    loadedFontUrls.add(href);
    return;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
  loadedFontUrls.add(href);
}

export function loadThemeFonts(tokens: Record<string, string>): void {
  for (const token of ['font-sans', 'font-serif', 'font-mono']) {
    const family = extractFontFamily(tokens[token]);
    if (family) loadGoogleFont(family);
  }
}
