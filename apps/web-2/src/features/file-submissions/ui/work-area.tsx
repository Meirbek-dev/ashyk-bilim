import { Suspense } from 'react'

import { RemediationGate } from '#/features/ai'
import { NextStepLink } from '#/features/player'
import { m } from '#/paraglide/messages'
import type { FileSubmission } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { presentError } from '#/shared/i18n/errors'

import { attemptsLeft, workOf } from '../model/task'
import { taskOptions, type WorkIds } from '../queries'
import { AttemptFiles } from './attempt-files'
import { DraftEditor } from './draft-editor'
import { GradeDetails } from './grade-details'
import { reasonLabels } from './labels'
import { Receipt } from './receipt'
import { ReturnedNotice } from './returned-notice'
import { ReviewNotes } from './review-notes'
import { useWork } from './use-work'

/**
 * The learner's work, by the newest attempt: files to change and submit, the receipt, or the result with a new
 * attempt. The server's `disabled_reasons` replace whatever the learner would do next (B-FSB-09); a remediation gate
 * shows its session in place.
 */
export function WorkArea({ task, ids }: { task: FileSubmission; ids: WorkIds }) {
  const work = useWork(ids)
  const state = workOf(task)
  const next = state.kind === 'edit' || (state.kind === 'done' && attemptsLeft(task))
  const reasons = [...new Set(task.disabled_reasons.map(reason => reasonLabels[reason]()))]
  const retry = next && reasons.length === 0 && state.kind === 'done'
  const returned = state.kind === 'edit' && state.attempt?.status === 'returned' ? state.attempt : null
  return (
    <section aria-labelledby="submission-work" className="flex flex-col gap-4">
      <h2 id="submission-work" className="text-xl font-semibold">
        {state.kind === 'done' ? m.submission_result_title() : m.submission_your_work()}
      </h2>
      {state.kind === 'waiting' ? <Receipt attempt={state.attempt} /> : null}
      {state.kind === 'done' ? (
        <>
          <GradeDetails attempt={state.attempt} />
          <AttemptFiles files={state.attempt.files} />
        </>
      ) : null}
      {returned ? <ReturnedNotice attempt={returned} revisable={reasons.length === 0} /> : null}
      {next && reasons.length > 0 ? (
        <ul className="flex flex-col gap-1 text-muted-foreground">
          {reasons.map(reason => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {/* The review is there to work on while the hand-in waits too (the learner was told of it, B-NOT-19). */}
      {task.disabled_reasons.includes('REMEDIATION_REQUIRED') ? (
        <Suspense fallback={null}>
          <RemediationGate activityId={task.activity_id} invalidates={[taskOptions(task.activity_id).queryKey]} />
        </Suspense>
      ) : null}
      {next && reasons.length === 0 && state.kind === 'edit' ? (
        <DraftEditor task={task} run={work.run} pending={work.pending} submitting={work.submitting} />
      ) : null}
      {retry ? (
        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={null}>
            <NextStepLink courseId={ids.courseId} activityId={ids.activityId} />
          </Suspense>
          <SubmitButton variant="secondary" pending={work.pending} onClick={() => work.run({ kind: 'start' })}>
            {m.submission_new_attempt()}
          </SubmitButton>
        </div>
      ) : null}
      {/* Handed in, or a draft nothing can be done with (a closed deadline): the way on to the next activity (B-PLY-18),
          beside a new attempt when one is open. */}
      {(state.kind !== 'edit' || reasons.length > 0) && !retry ? (
        <div>
          <Suspense fallback={null}>
            <NextStepLink courseId={ids.courseId} activityId={ids.activityId} />
          </Suspense>
        </div>
      ) : null}
      {state.attempt ? (
        <Suspense fallback={null}>
          <ReviewNotes attempt={state.attempt} />
        </Suspense>
      ) : null}
      {work.error ? <ErrorAlert>{presentError(work.error)}</ErrorAlert> : null}
      <ConflictDialog
        open={work.conflict}
        onOpenChange={open => (open ? undefined : work.closeConflict())}
        onRetry={() => void work.retry()}
        pending={work.pending}
      />
    </section>
  )
}
