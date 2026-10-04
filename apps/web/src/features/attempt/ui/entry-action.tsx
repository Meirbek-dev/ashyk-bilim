import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link as RouterLink, useNavigate, useParams } from '@tanstack/react-router'
import { useId, useState } from 'react'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { AssessmentDetail, AttemptState, DisabledReason } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { formatDate } from '#/shared/i18n/format'
import { presentError } from '#/shared/i18n/errors'
import { Button, buttonVariants } from '#/shared/ui/button'
import { Checkbox } from '#/shared/ui/checkbox'
import { Field, FieldLabel } from '#/shared/ui/field'
import { Spinner } from '#/shared/ui/spinner'

import { entryAction, protections } from '../model/attempt'
import { startOptions, stateOptions, submissionKey } from '../queries'
import { ATTEMPT_PATH, ATTEMPT_ROUTE } from './attempt-frame'

const reasons = {
  NOT_PUBLISHED: m.attempt_reason_not_published,
  SCHEDULED_NOT_OPEN: m.attempt_reason_not_open,
  ARCHIVED: m.attempt_reason_archived,
  COURSE_ARCHIVED: m.attempt_reason_course_archived,
  PAST_DUE: m.attempt_reason_past_due,
  MAX_ATTEMPTS_REACHED: m.attempt_reason_max_attempts,
  TIME_LIMIT_EXPIRED: m.attempt_reason_time_expired,
  REMEDIATION_REQUIRED: m.attempt_reason_remediation,
  ACCESS_RESTRICTED: m.attempt_reason_access,
} satisfies Record<DisabledReason, () => string>

type EntryActionProps = { assessment: AssessmentDetail; state: AttemptState }

/**
 * The entry's one action from `attempt-state` (B-ATT-03, B-ATT-04): continue the open draft, start (after the rules
 * are accepted when the exam has protections), or the reasons it is closed. A refused start rereads the state.
 */
export function EntryAction({ assessment, state }: EntryActionProps) {
  const params = useParams({ from: ATTEMPT_ROUTE })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const start = useMutation(startOptions(params.courseId, assessment.id))
  const [agreed, setAgreed] = useState(false)
  const consentId = useId()
  const rules = protections(assessment.policy)
  const action = entryAction(state)
  const reread = async () => {
    await queryClient.fetchQuery({ ...stateOptions(assessment.id), staleTime: 0 }).catch(() => null)
  }
  if (action.kind === 'continue')
    return (
      <RouterLink to={ATTEMPT_PATH} params={params} search={{ attempt: action.draftId }} className={buttonVariants()}>
        {m.attempt_continue()}
      </RouterLink>
    )
  if (action.kind === 'blocked')
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">{m.attempt_blocked_heading()}</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          {action.reasons.map(reason => (
            <li key={reason}>{reasons[reason]()}</li>
          ))}
          {state.opens_at_unix ? <li>{m.attempt_opens_at({ date: formatDate(state.opens_at_unix) })}</li> : null}
        </ul>
      </section>
    )
  const begin = () => {
    if (rules.includes('fullscreen')) void document.documentElement.requestFullscreen().catch(() => null)
    start.mutate(
      { path: { assessment_id: assessment.id } },
      {
        onSuccess: attempt => {
          queryClient.setQueryData(submissionKey(attempt.id), attempt)
          void navigate({ to: ATTEMPT_PATH, params, search: { attempt: attempt.id } })
        },
        onError: error => {
          if (error instanceof ApiError && error.status === 403) void reread()
        },
      },
    )
  }
  const refused = start.error instanceof ApiError && start.error.status === 403
  return (
    <div className="flex flex-col items-start gap-4">
      {rules.length ? (
        <Field orientation="horizontal">
          <Checkbox id={consentId} checked={agreed} onCheckedChange={checked => setAgreed(checked)} />
          <FieldLabel htmlFor={consentId}>{m.attempt_consent()}</FieldLabel>
        </Field>
      ) : null}
      <Button onClick={begin} disabled={start.isPending || (rules.length > 0 && !agreed)}>
        {start.isPending ? <Spinner data-icon="inline-start" /> : null}
        {action.revision ? m.attempt_revise() : m.attempt_start()}
      </Button>
      {start.error && !refused ? <ErrorAlert>{presentError(start.error)}</ErrorAlert> : null}
    </div>
  )
}
