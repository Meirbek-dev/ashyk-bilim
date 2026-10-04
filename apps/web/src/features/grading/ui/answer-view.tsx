import { ArrowRight } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { AssessmentItem, CorrectAnswer, ItemAnswer, MatchingPair } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'

const isPairs = (key: CorrectAnswer | null): key is MatchingPair[] =>
  Array.isArray(key) && key.every(entry => typeof entry === 'object')

const pairs = (list: readonly MatchingPair[]) => (
  <ul className="flex flex-col gap-1">
    {list.map(pair => (
      <li key={`${pair.left}:${pair.right}`} className="flex flex-wrap items-center gap-2">
        <span className="wrap-anywhere">{pair.left}</span>
        <ArrowRight aria-hidden className="size-4 shrink-0" />
        <span className="wrap-anywhere">{pair.right}</span>
      </li>
    ))}
  </ul>
)

function choice(item: AssessmentItem, answer: ItemAnswer | undefined, key: CorrectAnswer | null) {
  if (item.body.kind !== 'choice') return null
  const chosen = answer?.kind === 'choice' ? (answer.selected ?? []) : []
  const right = (id: string, flag: boolean | undefined) =>
    flag === true || (Array.isArray(key) && key.some(entry => entry === id))
  return (
    <ul className="flex flex-col gap-1">
      {(item.body.options ?? []).map(option => (
        <li key={option.id} className="flex flex-wrap items-center gap-2">
          <span className="wrap-anywhere">{option.text}</span>
          {chosen.includes(option.id) ? <StatusBadge tone="neutral">{m.grading_chosen()}</StatusBadge> : null}
          {right(option.id, option.is_correct) ? <StatusBadge tone="success">{m.grading_right()}</StatusBadge> : null}
        </li>
      ))}
    </ul>
  )
}

function given(item: AssessmentItem, answer: ItemAnswer | undefined) {
  if (!answer) return <p className="text-muted-foreground">{m.grading_no_answer()}</p>
  switch (answer.kind) {
    case 'open_text':
      return <p className="wrap-anywhere whitespace-pre-wrap">{answer.text}</p>
    case 'form': {
      const fields = item.body.kind === 'form' ? (item.body.fields ?? []) : []
      return (
        <dl className="flex flex-col gap-1">
          {fields.map(field => (
            <div key={field.id} className="flex flex-wrap gap-2">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="wrap-anywhere">{answer.values?.[field.id]}</dd>
            </div>
          ))}
        </dl>
      )
    }
    case 'code':
      return (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{m.grading_code_language({ id: answer.language })}</p>
          <pre className="overflow-x-auto rounded-md border bg-muted p-4 font-mono text-sm">{answer.source}</pre>
        </div>
      )
    case 'matching':
      return pairs(answer.matches ?? [])
    default:
      // A choice answer is drawn over the options (choice()).
      return null
  }
}

type AnswerViewProps = { item: AssessmentItem; answer: ItemAnswer | undefined; answerKey: CorrectAnswer | null }

/**
 * The learner's answer as its kind needs (B-GRD-11): options with the chosen and the correct ones marked, text,
 * form fields, code read-only, matched pairs; then the matching key when there is one.
 */
export function AnswerView({ item, answer, answerKey }: AnswerViewProps) {
  if (item.body.kind === 'choice') return choice(item, answer, answerKey)
  const key = isPairs(answerKey)
    ? answerKey
    : item.body.kind === 'matching' && 'pairs' in item.body
      ? item.body.pairs
      : []
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{m.grading_answer()}</p>
      {given(item, answer)}
      {key.length > 0 ? (
        <>
          <p className="text-sm font-medium">{m.grading_correct_answer()}</p>
          {pairs(key)}
        </>
      ) : null}
    </div>
  )
}
