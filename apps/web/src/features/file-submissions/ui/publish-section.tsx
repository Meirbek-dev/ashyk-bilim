import { useMutation, useQueryClient } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { FileSubmission } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { StatusBadge } from '#/shared/components/status-badge'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'
import { toast } from '#/shared/ui/toast'

import { publishTaskOptions } from '../queries'
import { lifecycleHints, lifecycleStatus } from './labels'

// The publish gate's 422 names the missing field; the instructions are the one a teacher can miss here.
const needsInstructions = (error: unknown) =>
  error instanceof ApiError && error.fieldErrors.some(field => field.field === 'instructions')

/**
 * The task's own state (B-FSB-13): a draft is invisible to learners until published here; publishing also turns the
 * activity live, so the header switch follows.
 */
export function PublishSection({ task }: { task: FileSubmission }) {
  const publish = useMutation(publishTaskOptions(useQueryClient(), task.course_id, task.activity_id))
  const status = lifecycleStatus[task.lifecycle]
  const run = () =>
    publish.mutate(
      { path: { file_submission_id: task.id } },
      { onSuccess: () => toast.add({ title: m.submission_published_toast() }) },
    )
  return (
    <section aria-labelledby="submission-publishing" className="flex max-w-prose flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="submission-publishing" className="text-xl font-semibold">
          {m.submission_publishing()}
        </h2>
        <StatusBadge tone={status.tone}>{status.label()}</StatusBadge>
      </div>
      <p className="text-sm text-muted-foreground">{lifecycleHints[task.lifecycle]()}</p>
      {task.lifecycle === 'draft' ? (
        <div>
          <Button disabled={publish.isPending} onClick={run}>
            {publish.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.submission_publish()}
          </Button>
        </div>
      ) : null}
      {publish.error ? (
        <ErrorAlert>
          {needsInstructions(publish.error) ? m.submission_publish_needs_instructions() : presentError(publish.error)}
        </ErrorAlert>
      ) : null}
    </section>
  )
}
