import type { AssessmentItem } from './items'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/**
 * Human lines for a released `GradedItem.user_answer` (the tagged wire
 * `ItemAnswer`) or `correct_answer` (choice option ids, matching pairs)
 * against the item they answer — what the review under
 * `review_visibility: full` prints (UX-088). Empty when there is nothing.
 */
export function answerLines(item: AssessmentItem, value: unknown): string[] {
  if (value === null || value === undefined) return []
  const { body } = item
  const optionText = (id: unknown) =>
    body.kind === 'CHOICE' ? (body.options.find(o => o.id === id)?.text ?? String(id)) : String(id)
  const pair = (p: unknown) => (isRecord(p) ? `${String(p.left)} → ${String(p.right)}` : String(p))

  if (Array.isArray(value)) {
    // `correct_answer`: option ids for a choice, `{left, right}` pairs for a matching.
    return value.map(entry => (isRecord(entry) ? pair(entry) : optionText(entry)))
  }
  if (!isRecord(value)) return [String(value)]
  switch (value.kind) {
    case 'choice': {
      return Array.isArray(value.selected) ? value.selected.map(optionText) : []
    }
    case 'matching': {
      return Array.isArray(value.matches) ? value.matches.map(pair) : []
    }
    case 'open_text': {
      return typeof value.text === 'string' && value.text.trim() ? [value.text] : []
    }
    case 'code': {
      return typeof value.source === 'string' && value.source.trim() ? [value.source] : []
    }
    case 'form': {
      return isRecord(value.values)
        ? Object.entries(value.values).map(([field, answer]) => {
            const label = body.kind === 'FORM' ? (body.fields.find(f => f.id === field)?.label ?? field) : field
            return `${label}: ${String(answer)}`
          })
        : []
    }
    default: {
      return []
    }
  }
}
