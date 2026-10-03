import { useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'

import { m } from '#/paraglide/messages'
import type { StudentSubmission } from '#/shared/api/gen/types.gen'
import { formatPercent } from '#/shared/i18n/format'
import { Skeleton } from '#/shared/ui/skeleton'

import { answerOf, languageOf, testsPassed, type CodeItem } from '../model/arena'
import { languagesOptions } from '../queries'
import { CodeEditor } from './lazy-editor'

/** What the attempt came to (B-COD-10): the grade once released, else why it is not shown yet. */
function outcome(attempt: StudentSubmission): string[] {
  if (attempt.release_state === 'returned_for_revision') return [m.code_result_returned()]
  if (attempt.status === 'pending') return [m.code_result_pending()]
  if (attempt.release_state !== 'visible') return [m.code_result_later()]
  const cases = testsPassed(attempt)
  return [
    ...(attempt.final_score === null ? [] : [m.code_result_score({ score: formatPercent(attempt.final_score) })]),
    ...(cases ? [m.code_result_cases({ passed: cases.correct, total: cases.total })] : []),
  ]
}

/** A handed-in attempt: its result and its code in its language, read only (B-COD-11). */
export function AttemptDetail({ attempt, code }: { attempt: StudentSubmission; code: CodeItem }) {
  const { data: languages } = useSuspenseQuery(languagesOptions())
  const answer = answerOf(attempt, code.item.id)
  const language = answer ? languageOf(languages, answer.language) : null
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {outcome(attempt).map(line => (
        <p key={line}>{line}</p>
      ))}
      {answer ? (
        <>
          <p className="text-muted-foreground">{language?.name ?? m.code_language_unknown({ id: answer.language })}</p>
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <CodeEditor
              readOnly
              value={answer.source}
              mode={language?.monaco_language ?? 'plaintext'}
              label={m.code_attempt_code({ number: attempt.attempt_number })}
            />
          </Suspense>
        </>
      ) : (
        <p className="text-muted-foreground">{m.code_no_code()}</p>
      )}
    </div>
  )
}
