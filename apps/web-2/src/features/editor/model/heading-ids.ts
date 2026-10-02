/** A heading anchor slug: lowercase, letters (Cyrillic and Kazakh too) and digits, words joined by "-". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const headingId = (text: string, occurrence: number) => {
  const slug = slugify(text) || 'section'
  return occurrence > 0 ? `heading-${slug}-${occurrence + 1}` : `heading-${slug}`
}

type Heading = { pos: number; id: unknown; text: string }

/**
 * Stable unique `id` attributes for headings (outline links, `#anchor` URLs). A stored id is kept unless it
 * is empty or taken by an earlier heading. Returns only the headings whose id must change.
 */
export function headingIdUpdates(headings: readonly Heading[]): { pos: number; id: string }[] {
  const counts = new Map<string, number>()
  const seen = new Set<string>()
  const updates: { pos: number; id: string }[] = []
  for (const heading of headings) {
    const key = slugify(heading.text) || 'section'
    const stored = typeof heading.id === 'string' ? heading.id.trim() : ''
    let id = stored
    while (!id || seen.has(id)) {
      const occurrence = counts.get(key) ?? 0
      id = headingId(heading.text, occurrence)
      if (seen.has(id)) counts.set(key, occurrence + 1)
    }
    counts.set(key, (counts.get(key) ?? 0) + 1)
    seen.add(id)
    if (id !== stored) updates.push({ pos: heading.pos, id })
  }
  return updates
}
