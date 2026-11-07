/**
 * A translated «label: value» line taken apart around its value, so the value can be set large and the words small
 * while the sentence stays the catalog's. A line that does not hold the value keeps whole, as the label.
 */
export function valueLine(text: string, value: string): { label: string; value: string | null } {
  const at = text.indexOf(value)
  if (at <= 0 || text.slice(at + value.length).trim() !== '') return { label: text, value: null }
  return { label: text.slice(0, at).replace(/[:\s]+$/, ''), value }
}
