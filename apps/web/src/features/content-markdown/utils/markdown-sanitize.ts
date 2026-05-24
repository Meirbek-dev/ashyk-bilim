const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const PLATFORM_IMAGE_PREFIXES = ['/uploads/', '/api/uploads/', '/media/', '/static/uploads/'];

export function isSafeMarkdownUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('//')) return false;
  if (trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return true;
  }
  try {
    const url = new URL(trimmed, 'https://ashyk-bilim.local');
    return SAFE_URL_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

export function sanitizeMarkdownUrl(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return isSafeMarkdownUrl(trimmed) ? trimmed : undefined;
}

export function isSafeMarkdownImageUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!isSafeMarkdownUrl(trimmed)) return false;
  return PLATFORM_IMAGE_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

export function sanitizeMarkdownImageUrl(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return isSafeMarkdownImageUrl(trimmed) ? trimmed : undefined;
}

export function hasRawHtml(markdown: string): boolean {
  return /<\/?[a-z][\w:-]*(?:\s+[^>]*)?>/i.test(markdown);
}

export function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\r\n?/g, '\n').trimEnd();
}

export function isMarkdownStructurallyEmpty(markdown: string): boolean {
  const normalized = markdown.replace(/\\[nr]/g, '\n');
  const withoutFences = normalized.replace(/```[\s\S]*?```/g, '');
  const withoutSyntax = withoutFences
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[[^\]]*]\([^)]+\)/g, '')
    .replace(/[#>*_`~|\-[\]()+.!]/g, '')
    .replace(/\s+/g, '');
  return withoutSyntax.length === 0 && !/```[\s\S]*\S[\s\S]*```/.test(normalized);
}

export function findUnsafeMarkdownLinks(markdown: string): string[] {
  const unsafe: string[] = [];
  const linkPattern = /!?\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of markdown.matchAll(linkPattern)) {
    const url = match[1];
    if (url && !isSafeMarkdownUrl(url)) unsafe.push(url);
  }
  return unsafe;
}
