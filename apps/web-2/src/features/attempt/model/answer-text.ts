import type { CorrectAnswer, ItemAnswer, ItemBody } from '#/shared/api/gen/types.gen'

// The result's plain-text view of an answer and of the server's answer key (B-ATT-18). Option ids become their
// texts through the item the learner saw; matching ids are already the texts (server rule).

const optionText = (body: ItemBody, id: string) =>
  body.kind === 'choice' ? (body.options?.find(option => option.id === id)?.text ?? id) : id

const pairs = (list: { left: string; right: string }[]) => list.map(pair => `${pair.left} → ${pair.right}`).join('; ')

/** The learner's answer as one line; empty when there is none. */
export function answerText(body: ItemBody, answer: ItemAnswer | null | undefined): string {
  if (!answer) return ''
  if (answer.kind === 'choice') return (answer.selected ?? []).map(id => optionText(body, id)).join(', ')
  if (answer.kind === 'open_text') return answer.text ?? ''
  if (answer.kind === 'code') return answer.source ?? ''
  if (answer.kind === 'matching') return pairs(answer.matches ?? [])
  const labels = body.kind === 'form' ? (body.fields ?? []) : []
  return Object.entries(answer.values ?? {})
    .filter(([, value]) => value.trim())
    .map(([id, value]) => `${labels.find(field => field.id === id)?.label ?? id}: ${value}`)
    .join('; ')
}

/** The answer key the server sent: correct option ids (choice) or the expected pairs (matching). */
export function correctText(body: ItemBody, key: CorrectAnswer): string {
  const ids = key.filter(entry => typeof entry === 'string')
  if (ids.length) return ids.map(id => optionText(body, id)).join(', ')
  return pairs(key.filter(entry => typeof entry !== 'string'))
}
