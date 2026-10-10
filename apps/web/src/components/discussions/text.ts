import { useRef, useState } from 'react'

const HTML_TAG_PATTERN = /<[^>]*>/g
const HTML_ENTITY_PATTERNS: [RegExp, string][] = [
  [/&nbsp;/gi, ' '],
  [/&amp;/gi, '&'],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&quot;/gi, '"'],
  [/&#39;/gi, "'"],
]

export function hasMeaningfulText(value: string): boolean {
  const stripped = HTML_ENTITY_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value.replace(HTML_TAG_PATTERN, ' '),
  )

  return stripped.replace(/\s+/g, ' ').trim().length > 0
}

/**
 * One submission at a time (a double click on «Опубликовать» posted twice), and the caller learns whether it
 * worked: a form clears / closes only on success, so a failed post keeps the typed text.
 */
export function useSubmitOnce() {
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const run = async (submit: () => Promise<boolean>): Promise<boolean> => {
    if (busy.current) return false
    busy.current = true
    setPending(true)
    const ok = await submit().catch(() => false)
    busy.current = false
    setPending(false)
    return ok
  }
  return { pending, run }
}
