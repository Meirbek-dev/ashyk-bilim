import * as v from 'valibot'

import type { AssessmentItem, ItemBody, ItemMetadata, UpdateItemRequest } from '#/shared/api/gen/types.gen'
import { vItemBody, vItemMetadata, vUpdateItemRequest } from '#/shared/api/gen/valibot.gen'

// A question's editor form: the request's own fields, with points and the draw group as typed text. Every rule comes
// from the generated body schema (title length, points range, body shape); the publish rules are the server's
// readiness. The body and the metadata go back whole: what the editor does not show (an imported question's pictures,
// its plain format, short-answer keys, distractors) survives an edit of what it does.

export type ItemForm = { title: string; points: string; draw_group: string; body: ItemBody; metadata: ItemMetadata }

const { title, max_score: maxScore } = vUpdateItemRequest.entries

/** Typed text that reads as a number the contract accepts for `max_score`. */
const points = v.pipe(
  v.string(),
  v.check(text => text.trim() !== '' && v.is(maxScore, Number(text.replace(',', '.')))),
)

/** The server's cap on a draw group (`ItemMetadata.draw_group`, 32 characters). */
const drawGroup = v.pipe(v.string(), v.trim(), v.maxLength(32))

export const itemFormSchema = v.object({
  title: title.wrapped,
  points,
  draw_group: drawGroup,
  body: vItemBody,
  metadata: vItemMetadata,
})

export const itemForm = (item: AssessmentItem): ItemForm => ({
  title: item.title,
  points: String(item.max_score),
  draw_group: item.metadata.draw_group ?? '',
  body: item.body,
  metadata: item.metadata,
})

export const itemPatch = (form: ItemForm): UpdateItemRequest => ({
  title: form.title,
  max_score: Number(form.points.replace(',', '.')),
  body: form.body,
  metadata: { ...form.metadata, draw_group: form.draw_group.trim() || null },
})

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The fields of `next` that differ from what the server last took (`saved`). Only they are sent: a title edit does not
 * move the assessment's `version`, so a whole-item save of the points carried a stale title back over a co-author's
 * rename without a 412.
 */
export function changedFields(saved: UpdateItemRequest, next: UpdateItemRequest): UpdateItemRequest {
  const patch: UpdateItemRequest = {}
  if (next.title !== undefined && next.title !== saved.title) patch.title = next.title
  if (next.max_score !== undefined && next.max_score !== saved.max_score) patch.max_score = next.max_score
  if (next.body !== undefined && !same(next.body, saved.body)) patch.body = next.body
  if (next.metadata !== undefined && !same(next.metadata, saved.metadata)) patch.metadata = next.metadata
  return patch
}
