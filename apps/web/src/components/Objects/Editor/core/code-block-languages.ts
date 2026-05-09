export const PLAIN_TEXT_CODE_BLOCK_LANGUAGE = 'plain-text';

export const CODE_BLOCK_LANGUAGE_VALUES = [
  'html',
  'css',
  'javascript',
  'typescript',
  'python',
  'java',
  'kotlin',
] as const;

export type SupportedCodeBlockLanguage = (typeof CODE_BLOCK_LANGUAGE_VALUES)[number];
export type CodeBlockLanguageValue = SupportedCodeBlockLanguage | typeof PLAIN_TEXT_CODE_BLOCK_LANGUAGE;

const CODE_BLOCK_LANGUAGE_ALIASES: Record<string, SupportedCodeBlockLanguage> = {
  css: 'css',
  cts: 'typescript',
  html: 'html',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  jsx: 'javascript',
  kt: 'kotlin',
  kotlin: 'kotlin',
  kts: 'kotlin',
  mts: 'typescript',
  py: 'python',
  python: 'python',
  ts: 'typescript',
  tsx: 'typescript',
  typescript: 'typescript',
  xml: 'html',
};

export function normalizeCodeBlockLanguage(language: string | null | undefined): CodeBlockLanguageValue {
  const normalized = language?.trim().toLowerCase();

  if (!normalized) {
    return PLAIN_TEXT_CODE_BLOCK_LANGUAGE;
  }

  return CODE_BLOCK_LANGUAGE_ALIASES[normalized] ?? PLAIN_TEXT_CODE_BLOCK_LANGUAGE;
}

export function toCodeBlockLanguageAttribute(language: string | null | undefined): SupportedCodeBlockLanguage | null {
  const normalized = normalizeCodeBlockLanguage(language);

  return normalized === PLAIN_TEXT_CODE_BLOCK_LANGUAGE ? null : normalized;
}
