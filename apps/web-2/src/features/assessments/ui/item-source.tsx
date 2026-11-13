import { m } from '#/paraglide/messages'
import type { ItemSource as Source } from '#/shared/api/gen/types.gen'

/** «Из Java_EXAM_2026_2.xlsx, строка 29»: where an imported question came from, to fix the file beside it. */
export function ItemSource({ source, className }: { source: Source | undefined; className: string }) {
  if (!source) return null
  return <span className={className}>{m.assessments_item_source({ file: source.file, row: String(source.row) })}</span>
}
