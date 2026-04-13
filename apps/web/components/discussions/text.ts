const HTML_TAG_PATTERN = /<[^>]*>/g;
const HTML_ENTITY_PATTERNS: [RegExp, string][] = [
  [/&nbsp;/gi, ' '],
  [/&amp;/gi, '&'],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&quot;/gi, '"'],
  [/&#39;/gi, "'"],
];

export function hasMeaningfulText(value: string): boolean {
  const stripped = HTML_ENTITY_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value.replace(HTML_TAG_PATTERN, ' '),
  );

  return stripped.replace(/\s+/g, ' ').trim().length > 0;
}
