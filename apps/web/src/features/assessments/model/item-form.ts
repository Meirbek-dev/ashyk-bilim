import * as v from 'valibot'

import type { AssessmentItem, ItemBody, UpdateItemRequest } from '#/shared/api/gen/types.gen'
import { vItemBody, vUpdateItemRequest } from '#/shared/api/gen/valibot.gen'

// A question's editor form: the request's own fields, with points as typed text. Every rule comes from the
// generated body schema (title length, points range, body shape); the publish rules are the server's readiness.

export type ItemForm = { title: string; points: string; body: ItemBody }

const { title, max_score: maxScore } = vUpdateItemRequest.entries

/** Typed text that reads as a number the contract accepts for `max_score`. */
const points = v.pipe(
  v.string(),
  v.check(text => text.trim() !== '' && v.is(maxScore, Number(text.replace(',', '.')))),
)

export const itemFormSchema = v.object({ title: title.wrapped, points, body: vItemBody })

export const itemForm = (item: AssessmentItem): ItemForm => ({
  title: item.title,
  points: String(item.max_score),
  body: item.body,
})

export const itemPatch = (form: ItemForm): UpdateItemRequest => ({
  title: form.title,
  max_score: Number(form.points.replace(',', '.')),
  body: form.body,
})
