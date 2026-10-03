import type {
  AssessmentItem,
  AssessmentKind,
  ChoiceBody,
  ChoiceVariant,
  CreateItemRequest,
  ItemBody,
} from '#/shared/api/gen/types.gen'

// The builder's pure rules: what "add a question" offers, the blank bodies, copies and the choice variants. The
// server checks the rest (readiness, 422).

/** What "add a question" offers: the server's item kinds per assessment kind, choice split by its variants. */
export type NewItemKind = ChoiceVariant | 'matching' | 'open_text' | 'form' | 'code'

/** Server rule (`AssessmentKind::allowed_item_kinds`): quiz and exam take the four question kinds, a challenge code. */
export const newItemKinds = (kind: AssessmentKind): readonly NewItemKind[] =>
  kind === 'code_challenge'
    ? ['code']
    : ['single_choice', 'multiple_choice', 'true_false', 'matching', 'open_text', 'form']

/** The label a question shows: a choice by its variant (legacy rows carry only `multiple`). */
export function itemKindOf(item: Pick<AssessmentItem, 'body'>): NewItemKind {
  const { body } = item
  if (body.kind !== 'choice') return body.kind
  return body.variant ?? (body.multiple ? 'multiple_choice' : 'single_choice')
}

const newId = () => crypto.randomUUID()

/** The fixed options of a true/false question: their texts are the server's labels, not the author's. */
const trueFalseOptions = (correct: 'true' | 'false' = 'true') => [
  { id: 'true', text: 'true', is_correct: correct === 'true' },
  { id: 'false', text: 'false', is_correct: correct === 'false' },
]

const choice = (variant: ChoiceVariant, options: Choice['options']): Choice => ({
  kind: 'choice',
  variant,
  multiple: variant === 'multiple_choice',
  prompt: '',
  explanation: null,
  options,
})

const blankBodies: Record<NewItemKind, () => ItemBody> = {
  single_choice: () => choice('single_choice', blankOptions()),
  multiple_choice: () => choice('multiple_choice', blankOptions()),
  true_false: () => choice('true_false', trueFalseOptions()),
  matching: () => ({ kind: 'matching', prompt: '', explanation: null, pairs: [{ left: '', right: '' }] }),
  open_text: () => ({ kind: 'open_text', prompt: '', min_words: null, rubric: null }),
  form: () => ({ kind: 'form', prompt: '', fields: [newFormField()] }),
  code: () => ({ kind: 'code', prompt: '', max_output_kb: null, memory_limit_mb: null, time_limit_seconds: null }),
}

/** A new question: one point, an empty body of its kind; the server appends it last. */
export const newItem = (kind: NewItemKind, title: string): CreateItemRequest => ({
  title,
  max_score: 1,
  body: blankBodies[kind](),
})

/** A copy of a question with fresh option and field ids (the grader matches answers by id, BUG-199). */
export function copyItem(item: AssessmentItem, title: string): CreateItemRequest {
  const { body } = item
  const fresh: ItemBody =
    body.kind === 'choice' && body.variant !== 'true_false'
      ? { ...body, options: body.options?.map(option => ({ ...option, id: newId() })) }
      : body.kind === 'form'
        ? { ...body, fields: body.fields?.map(field => ({ ...field, id: newId() })) }
        : body
  return { title, max_score: item.max_score, metadata: item.metadata, body: fresh }
}

export type Choice = ChoiceBody & { kind: 'choice' }

export const CHOICE_VARIANTS = ['single_choice', 'multiple_choice', 'true_false'] as const satisfies ChoiceVariant[]

/** A select's value as a variant (null for anything else). */
export const choiceVariant = (value: string): ChoiceVariant | null =>
  CHOICE_VARIANTS.find(variant => variant === value) ?? null

/**
 * A choice question switched to another variant. True/false gets its two fixed options; leaving it starts two empty
 * ones; single answer keeps only the first correct option correct.
 */
export function withVariant(body: Choice, variant: ChoiceVariant): Choice {
  const base = { ...body, variant, multiple: variant === 'multiple_choice' }
  if (variant === 'true_false') return { ...base, options: trueFalseOptions() }
  if (body.variant === 'true_false') return { ...base, options: blankOptions() }
  if (variant === 'multiple_choice') return base
  const first = body.options?.findIndex(option => option.is_correct) ?? -1
  return { ...base, options: body.options?.map((option, at) => ({ ...option, is_correct: at === first })) }
}

const blankOptions = () => [
  { id: newId(), text: '', is_correct: false },
  { id: newId(), text: '', is_correct: false },
]

export const newOption = () => ({ id: newId(), text: '', is_correct: false })
export const newFormField = () => ({ id: newId(), label: '', field_type: 'text' as const, required: true })

/** The header line of the builder: question count and the sum of points. */
export const totalPoints = (items: readonly Pick<AssessmentItem, 'max_score'>[]): number =>
  items.reduce((sum, item) => sum + item.max_score, 0)

/** The open question: the one in the URL, or the first when it is unknown or absent. */
export const openItem = (items: readonly AssessmentItem[], id: string | undefined): AssessmentItem | undefined =>
  items.find(item => item.id === id) ?? items[0]

/** Items reordered to a list of ids (a drag), positions renumbered 1..n like the server. */
export const inOrder = (items: readonly AssessmentItem[], ids: readonly string[]): AssessmentItem[] =>
  ids.flatMap((id, at) => {
    const item = items.find(row => row.id === id)
    return item ? [{ ...item, position: at + 1 }] : []
  })
