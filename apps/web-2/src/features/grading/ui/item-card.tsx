import { Suspense, type ReactNode } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { AssessmentItem, GradedItem, ItemAnswer } from '#/shared/api/gen/types.gen'

import { AnswerView } from './answer-view'
import { itemKindText, verdictText } from './labels'
import { StatusText } from './status-text'

type ItemCardProps = {
  item: AssessmentItem
  answer: ItemAnswer | undefined
  graded: GradedItem | undefined
  /** Out of the list for now (the «need attention» view); its fields stay in the form. */
  hidden?: boolean
  /** The grader's fields for this item. */
  children: ReactNode
}

/** One question of the work (B-GRD-11): wording, the learner's answer, the key and the auto-grader's verdict. */
export function ItemCard({ item, answer, graded, hidden, children }: ItemCardProps) {
  const verdict = graded ? verdictText(graded) : null
  const tone = graded?.correct === true ? 'success' : graded?.correct === false ? 'destructive' : 'neutral'
  // Most migrated questions repeat the title as the prompt: show the wording once.
  const prompt = item.body.prompt?.trim() && item.body.prompt.trim() !== item.title.trim() ? item.body.prompt : null
  // An open answer's criteria, as the author wrote them for the grader (B-GRD-30).
  const criteria = item.body.kind === 'open_text' ? item.body.rubric?.trim() : null
  return (
    // The page and its margin: the question and the answer read on the left, the grader's marks stand beside them.
    <li hidden={hidden} className="grid gap-x-10 gap-y-4 border-b py-8 @3xl/review:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold wrap-anywhere">
            {m.grading_item_title({ number: item.position, title: item.title })}
          </h3>
          <p className="text-sm text-muted-foreground">{itemKindText(item.kind, item.body)}</p>
        </div>
        {prompt ? (
          // The author's markdown, as the learner saw it (migrated prompts carry `## **…**`).
          <Suspense fallback={<p className="wrap-anywhere whitespace-pre-wrap">{prompt}</p>}>
            <MarkdownView content={prompt} />
          </Suspense>
        ) : null}
        <AnswerView
          item={item}
          answer={answer ?? graded?.user_answer ?? undefined}
          answerKey={graded?.correct_answer ?? null}
        />
        {criteria ? (
          <section className="flex flex-col gap-1 border-l-2 ps-4">
            <h4 className="text-sm font-medium">{m.grading_criteria()}</h4>
            <Suspense fallback={<p className="text-sm wrap-anywhere whitespace-pre-wrap">{criteria}</p>}>
              <MarkdownView content={criteria} />
            </Suspense>
          </section>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {verdict || graded?.needs_manual_review ? (
          <p className="flex flex-wrap gap-x-3 text-sm font-medium">
            {verdict ? <StatusText tone={tone}>{verdict}</StatusText> : null}
            {graded?.needs_manual_review ? <StatusText tone="warning">{m.grading_needs_review()}</StatusText> : null}
          </p>
        ) : null}
        {children}
      </div>
    </li>
  )
}
