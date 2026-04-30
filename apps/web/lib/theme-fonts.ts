export const THEME_FONT_TOKENS = ['font-sans', 'font-serif', 'font-mono'] as const;

export const THEME_FONT_LINK_ATTRIBUTE = 'data-theme-fonts';
export const THEME_FONT_FAMILIES_ATTRIBUTE = 'data-theme-font-families';

export const GOOGLE_FONTS_STYLESHEET_ORIGIN = 'https://fonts.googleapis.com';
export const GOOGLE_FONTS_ASSET_ORIGIN = 'https://fonts.gstatic.com';

const SYSTEM_FONT_FAMILY_NAMES = [
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
  'apple color emoji',
  'arial',
  'cambria',
  'cantarell',
  'cascadia code',
  'consolas',
  'courier new',
  'georgia',
  'helvetica',
  'helvetica neue',
  'lucida grande',
  'menlo',
  'monaco',
  'noto color emoji',
  'noto sans',
  'segoe ui',
  'segoe ui emoji',
  'segoe ui symbol',
  'sfmono-regular',
  'times',
  'times new roman',
];

export const SYSTEM_FONT_FAMILY_KEYS = Object.freeze([...SYSTEM_FONT_FAMILY_NAMES].toSorted());

export const GOOGLE_FONT_QUERY_BY_FAMILY = Object.freeze({
  'Albert Sans': 'Albert Sans:wght@400..700',
  'Antic': 'Antic',
  'Architects Daughter': 'Architects Daughter',
  'DM Mono': 'DM Mono:wght@400;500',
  'DM Sans': 'DM Sans:opsz,wght@9..40,400..700',
  'DM Serif Display': 'DM Serif Display',
  'DM Serif Text': 'DM Serif Text',
  'Fira Code': 'Fira Code:wght@400..700',
  'Geist': 'Geist:wght@400..700',
  'Geist Mono': 'Geist Mono:wght@400..700',
  'IBM Plex Mono': 'IBM Plex Mono:wght@400;500;600;700',
  'Inter': 'Inter:opsz,wght@14..32,400..700',
  'JetBrains Mono': 'JetBrains Mono:wght@400..700',
  'Libre Baskerville': 'Libre Baskerville:wght@400;700',
  'Lora': 'Lora:wght@400..700',
  'Merriweather': 'Merriweather:wght@400;700',
  'Montserrat': 'Montserrat:wght@400..700',
  'Open Sans': 'Open Sans:wght@400..700',
  'Outfit': 'Outfit:wght@400..700',
  'Oxanium': 'Oxanium:wght@400..700',
  'Playfair Display': 'Playfair Display:wght@400..700',
  'Plus Jakarta Sans': 'Plus Jakarta Sans:wght@400..700',
  'Poppins': 'Poppins:wght@400;500;600;700',
  'Quicksand': 'Quicksand:wght@400..700',
  'Roboto': 'Roboto:wght@400;500;700',
  'Roboto Mono': 'Roboto Mono:wght@400;500;700',
  'Source Code Pro': 'Source Code Pro:wght@400..700',
  'Source Serif 4': 'Source Serif 4:opsz,wght@8..60,400..700',
  'Space Mono': 'Space Mono:wght@400;700',
  'Ubuntu Mono': 'Ubuntu Mono:wght@400;700',
} as const);

export type GoogleThemeFontFamily = keyof typeof GOOGLE_FONT_QUERY_BY_FAMILY;

const googleFontFamilyByKey = new Map(
  Object.keys(GOOGLE_FONT_QUERY_BY_FAMILY).map((family) => [
    normalizeFontFamilyKey(family),
    family as GoogleThemeFontFamily,
  ]),
);

const loadedGoogleFontFamilies = new Set<GoogleThemeFontFamily>();

function normalizeFontFamilyKey(family: string): string {
  return family
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function readFirstFontFamily(fontFamilyValue: string): string | null {
  let quote: '"' | "'" | null = null;
  let family = '';

  for (const char of fontFamilyValue) {
    if (quote) {
      if (char === quote) quote = null;
      family += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      family += char;
      continue;
    }

    if (char === ',') break;
    family += char;
  }

  const cleanFamily = family.trim().replace(/^['"]|['"]$/g, '');
  return cleanFamily || null;
}

export function extractFontFamily(fontFamilyValue: string | undefined): string | null {
  if (!fontFamilyValue) return null;

  const family = readFirstFontFamily(fontFamilyValue);
  if (!family || isSystemFontFamily(family)) return null;

  return family;
}

export function isSystemFontFamily(family: string): boolean {
  return SYSTEM_FONT_FAMILY_KEYS.includes(normalizeFontFamilyKey(family));
}

export function getGoogleThemeFontFamily(family: string): GoogleThemeFontFamily | null {
  return googleFontFamilyByKey.get(normalizeFontFamilyKey(family)) ?? null;
}

export function resolveThemeFontFamilies(tokens: Record<string, string>): GoogleThemeFontFamily[] {
  const families = new Set<GoogleThemeFontFamily>();

  for (const token of THEME_FONT_TOKENS) {
    const family = extractFontFamily(tokens[token]);
    const googleFamily = family ? getGoogleThemeFontFamily(family) : null;

    if (googleFamily) families.add(googleFamily);
  }

  return [...families].toSorted();
}

function encodeGoogleFontQuery(query: string): string {
  return query.trim().replaceAll(' ', '+');
}

export function buildGoogleFontCssUrl(families: readonly GoogleThemeFontFamily[]): string | null {
  const uniqueFamilies = [...new Set(families)].toSorted();
  if (uniqueFamilies.length === 0) return null;

  const familyParams = uniqueFamilies
    .map((family) => `family=${encodeGoogleFontQuery(GOOGLE_FONT_QUERY_BY_FAMILY[family])}`)
    .join('&');

  return `${GOOGLE_FONTS_STYLESHEET_ORIGIN}/css2?${familyParams}&display=swap`;
}

export function getThemeFontStylesheetHref(tokens: Record<string, string>): string | null {
  return buildGoogleFontCssUrl(resolveThemeFontFamilies(tokens));
}

export function buildFontCssUrl(family: string): string | null {
  const googleFamily = getGoogleThemeFontFamily(family);
  return googleFamily ? buildGoogleFontCssUrl([googleFamily]) : null;
}

function linkHrefExists(doc: Document, href: string): boolean {
  return [...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].some(
    (link) => link.href === href || link.getAttribute('href') === href,
  );
}

function hydrateLoadedGoogleFontsFromDocument(doc: Document): void {
  for (const link of doc.querySelectorAll<HTMLLinkElement>(`link[${THEME_FONT_LINK_ATTRIBUTE}]`)) {
    const rawFamilies = link.getAttribute(THEME_FONT_FAMILIES_ATTRIBUTE);
    if (!rawFamilies) continue;

    for (const rawFamily of rawFamilies.split('|')) {
      const googleFamily = getGoogleThemeFontFamily(rawFamily);
      if (googleFamily) loadedGoogleFontFamilies.add(googleFamily);
    }
  }
}

function ensurePreconnect(doc: Document, href: string, crossOrigin = false): void {
  const exists = [...doc.querySelectorAll<HTMLLinkElement>('link[rel="preconnect"]')].some(
    (link) => link.href === href || link.getAttribute('href') === href,
  );

  if (exists) return;

  const link = doc.createElement('link');
  link.rel = 'preconnect';
  link.href = href;
  if (crossOrigin) link.crossOrigin = 'anonymous';
  doc.head.appendChild(link);
}

export function ensureGoogleFontPreconnects(doc: Document = document): void {
  ensurePreconnect(doc, GOOGLE_FONTS_STYLESHEET_ORIGIN);
  ensurePreconnect(doc, GOOGLE_FONTS_ASSET_ORIGIN, true);
}

export function loadGoogleFontFamilies(families: readonly GoogleThemeFontFamily[]): void {
  if (typeof document === 'undefined') return;

  hydrateLoadedGoogleFontsFromDocument(document);

  const missingFamilies = [...new Set(families)].filter((family) => !loadedGoogleFontFamilies.has(family)).toSorted();

  if (missingFamilies.length === 0) return;

  const href = buildGoogleFontCssUrl(missingFamilies);
  if (!href) return;

  ensureGoogleFontPreconnects(document);

  if (!linkHrefExists(document, href)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(THEME_FONT_LINK_ATTRIBUTE, 'true');
    link.setAttribute(THEME_FONT_FAMILIES_ATTRIBUTE, missingFamilies.join('|'));
    document.head.appendChild(link);
  }

  for (const family of missingFamilies) {
    loadedGoogleFontFamilies.add(family);
  }
}

export function loadGoogleFont(family: string): void {
  const googleFamily = getGoogleThemeFontFamily(family);
  if (googleFamily) loadGoogleFontFamilies([googleFamily]);
}

export function loadThemeFonts(tokens: Record<string, string>): void {
  loadGoogleFontFamilies(resolveThemeFontFamilies(tokens));
}
