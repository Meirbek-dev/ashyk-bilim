import { useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'

import { m } from '#/paraglide/messages'
import type { AutoSubmitReason, StudentSubmission } from '#/shared/api/gen/types.gen'
import { formatPercent } from '#/shared/i18n/format'
import { Skeleton } from '#/shared/ui/skeleton'

import { answerOf, languageOf, languagesIn, testsPassed, type CodeItem } from '../model/arena'
import { runnerStateOptions } from '../queries'
import { FinalRun } from './final-run'
import { languageName } from './labels'
import { CodeEditor } from './lazy-editor'

/** Why the platform handed the attempt in, not the learner: a test's result says it too. */
const autoLabels = {
  time_expired: m.code_auto_time,
  deadline_passed: m.code_auto_deadline,
  late_cutoff_passed: m.code_auto_late_cutoff,
  integrity_violation: m.code_auto_violation,
} satisfies Record<AutoSubmitReason, () => string>

/**
 * What the attempt came to (B-COD-10): the grade once released with its late penalty, else why it is not shown yet;
 * after either, why it was handed in by itself, if it was.
 */
export function outcome(attempt: StudentSubmission): string[] {
  if (attempt.release_state === 'returned_for_revision') return [m.code_result_returned()]
  const auto = attempt.auto_submit_reason ? [autoLabels[attempt.auto_submit_reason]()] : []
  if (attempt.status === 'pending') return [m.code_result_pending(), ...auto]
  if (attempt.release_state !== 'visible') return [m.code_result_later(), ...auto]
  const cases = testsPassed(attempt)
  return [
    ...(attempt.final_score === null ? [] : [m.code_result_score({ score: formatPercent(attempt.final_score) })]),
    // A late hand-in's score is already reduced: say by how much, as a test's result does.
    ...(attempt.late_penalty_pct
      ? [m.code_result_late_penalty({ percent: formatPercent(attempt.late_penalty_pct) })]
      : []),
    ...(cases ? [m.code_result_cases({ passed: cases.correct, total: cases.total })] : []),
    ...auto,
  ]
}

/** A handed-in attempt: its result, the run it was graded on and its code in its language, read only (B-COD-11). */
export function AttemptDetail({ attempt, code }: { attempt: StudentSubmission; code: CodeItem }) {
  const { data: runner } = useSuspenseQuery(runnerStateOptions())
  const languages = languagesIn(runner)
  const answer = answerOf(attempt, code.item.id)
  const language = answer ? languageOf(languages, answer.language) : null
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {outcome(attempt).map(line => (
        <p key={line}>{line}</p>
      ))}
      {attempt.status === 'draft' ? null : <FinalRun itemId={code.item.id} submissionId={attempt.id} />}
      {/* An empty source (a migrated or blank hand-in) says so, not an empty read-only editor. */}
      {answer?.source.trim() ? (
        <>
          <p className="text-muted-foreground">{languageName(languages, answer.language)}</p>
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
