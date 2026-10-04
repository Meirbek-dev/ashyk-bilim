import { MarkdownView } from '#/features/markdown'
import type { RemediationQuestion } from '#/shared/api/gen/types.gen'

/** The answer and its explanation; nothing while the server withholds them (blank). */
export function AnswerKey({ question }: { question: RemediationQuestion }) {
  if (!question.answer) return null
  return (
    <div className="flex flex-col gap-1 rounded-md bg-muted p-3 text-sm">
      <MarkdownView content={question.answer} />
      {question.explanation ? <MarkdownView content={question.explanation} /> : null}
    </div>
  )
}
