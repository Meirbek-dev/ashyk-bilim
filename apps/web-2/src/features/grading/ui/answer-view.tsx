import { ArrowRight, Check, Circle, CircleDot, Square, SquareCheck, X } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { AssessmentItem, CorrectAnswer, ItemAnswer, MatchingPair } from '#/shared/api/gen/types.gen'
import { CodeLanguage } from './code-language'

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
  const multiple = item.body.multiple === true || item.body.variant === 'multiple_choice'
  const Mark = multiple ? Square : Circle
  const Marked = multiple ? SquareCheck : CircleDot
  return (
    <ul className="flex flex-col gap-1.5">
      {(item.body.options ?? []).map(option => {
        const picked = chosen.includes(option.id)
        const correct = right(option.id, option.is_correct)
        // With a key, a wrong pick says so in its tone and a cross: the one line a teacher looks for in the list.
        const wrongPick = picked && !correct && key !== null
        return (
          <li key={option.id} className="flex items-baseline gap-2.5">
            {picked ? (
              <Marked
                aria-hidden
                className={`size-4 shrink-0 translate-y-0.5 ${wrongPick ? 'text-destructive' : ''}`}
              />
            ) : (
              <Mark aria-hidden className="size-4 shrink-0 translate-y-0.5 text-muted-foreground" />
            )}
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
              <span className={`text-base wrap-anywhere ${picked ? 'font-medium' : 'text-muted-foreground'}`}>
                {option.text}
              </span>
              {picked ? (
                <span
                  className={`inline-flex items-center gap-1 text-sm ${wrongPick ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {wrongPick ? <X aria-hidden className="size-3.5" /> : null}
                  {m.grading_chosen()}
                </span>
              ) : null}
              {correct ? (
                <span className="inline-flex items-center gap-1 text-sm text-success">
                  <Check aria-hidden className="size-3.5" />
                  {m.grading_right()}
                </span>
              ) : null}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// Blank code or text was handed in as nothing: an empty box read as a rendering fault.
const blank = (answer: ItemAnswer) =>
  (answer.kind === 'code' && !answer.source?.trim()) || (answer.kind === 'open_text' && !answer.text?.trim())

function given(item: AssessmentItem, answer: ItemAnswer | undefined) {
  if (!answer || blank(answer)) return <p className="text-muted-foreground">{m.grading_no_answer()}</p>
  switch (answer.kind) {
    case 'open_text':
      return <p className="max-w-prose text-base wrap-anywhere whitespace-pre-wrap">{answer.text}</p>
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
          <CodeLanguage id={answer.language} />
          <pre className="overflow-x-auto border-y bg-muted/50 px-4 py-3 font-mono text-sm">{answer.source}</pre>
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
      <p className="text-sm text-muted-foreground">{m.grading_answer()}</p>
      {given(item, answer)}
      {key.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">{m.grading_correct_answer()}</p>
          {pairs(key)}
        </>
      ) : null}
    </div>
  )
}
