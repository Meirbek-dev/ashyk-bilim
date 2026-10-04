import { m } from '#/paraglide/messages'
import type { FileSubmission } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'

import { attemptsLeft, workOf } from '../model/task'
import type { WorkIds } from '../queries'
import { AttemptFiles } from './attempt-files'
import { DraftEditor } from './draft-editor'
import { GradeDetails } from './grade-details'
import { reasonLabels } from './labels'
import { Receipt } from './receipt'
import { useWork } from './use-work'

/**
 * The learner's work, by the newest attempt: files to change and submit, the receipt, or the result with a new
 * attempt. The server's `disabled_reasons` replace whatever the learner would do next (B-FSB-09).
 */
export function WorkArea({ task, ids }: { task: FileSubmission; ids: WorkIds }) {
  const work = useWork(ids)
  const state = workOf(task)
  const next = state.kind === 'edit' || (state.kind === 'done' && attemptsLeft(task))
  const reasons = [...new Set(task.disabled_reasons.map(reason => reasonLabels[reason]()))]
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
      {returned ? (
        <>
          <p className="font-medium">{m.submission_returned()}</p>
          <GradeDetails attempt={returned} />
        </>
      ) : null}
      {next && reasons.length > 0 ? (
        <ul className="flex flex-col gap-1 text-muted-foreground">
          {reasons.map(reason => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {next && reasons.length === 0 && state.kind === 'edit' ? (
        <DraftEditor task={task} run={work.run} pending={work.pending} submitting={work.submitting} />
      ) : null}
      {next && reasons.length === 0 && state.kind === 'done' ? (
        <div>
          <Button variant="secondary" disabled={work.pending} onClick={() => work.run({ kind: 'start' })}>
            {work.pending ? <Spinner data-icon="inline-start" /> : null}
            {m.submission_new_attempt()}
          </Button>
        </div>
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
