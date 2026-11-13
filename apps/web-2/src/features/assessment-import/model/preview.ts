import type { ImportSummary, PlannedItem } from '#/shared/api/gen/types.gen'

/** The DOT question types (column B: 1 single, 2 multiple, 3 short text, 4 matching, 5 essay). */
export type DotType = 'single' | 'multiple' | 'short' | 'matching' | 'essay'

const DOT_TYPES: readonly DotType[] = ['single', 'multiple', 'short', 'matching', 'essay']

/** Which DOT type a planned question came from. */
export function dotType({ body }: Pick<PlannedItem, 'body'>): DotType {
  if (body.kind === 'choice') return body.multiple ? 'multiple' : 'single'
  if (body.kind === 'matching') return 'matching'
  if (body.kind === 'open_text') return body.short_answer ? 'short' : 'essay'
  // Forms and code never come from a spreadsheet; shown as a written answer if one ever does.
  return 'essay'
}

export type PreviewRow = { row: number; item: PlannedItem | undefined }

/**
 * The cards of the preview in sheet order: every planned question, and every question row the server could not plan
 * (no type, say) but has issues for, so a click on such an issue still lands on a card.
 */
export function previewRows(items: readonly PlannedItem[], issueRows: Iterable<number>): PreviewRow[] {
  const byRow = new Map<number, PreviewRow>(items.map(item => [item.row, { row: item.row, item }]))
  for (const row of issueRows) if (row >= 2 && !byRow.has(row)) byRow.set(row, { row, item: undefined })
  return [...byRow.values()].toSorted((a, b) => a.row - b.row)
}

/** The header counters: «64 вопроса · 64 с одним ответом · 6 изображений», types without questions left out. */
export function summaryCounts(summary: ImportSummary): { type: DotType; count: number }[] {
  return DOT_TYPES.map(type => ({ type, count: summary[type] })).filter(entry => entry.count > 0)
}
