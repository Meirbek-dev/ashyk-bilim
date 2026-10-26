import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Timer } from 'lucide-react'
import { useId, useState } from 'react'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { AssessmentDetail, AttemptState, DisabledReason } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { Link } from '#/shared/components/link'
import { SubmitButton } from '#/shared/components/submit-button'
import { formatDateTime } from '#/shared/i18n/format'
import { presentError } from '#/shared/i18n/errors'
import { Checkbox } from '#/shared/ui/checkbox'
import { Field, FieldLabel } from '#/shared/ui/field'

import { entryAction, protections } from '../model/attempt'
import { startOptions, stateOptions, submissionKey } from '../queries'
import { ATTEMPT_PATH, ATTEMPT_ROUTE } from './attempt-frame'
import { ContinueDraft } from './continue-draft'

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
  NOT_ENROLLED: m.attempt_reason_not_enrolled,
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
    await queryClient.query({ ...stateOptions(assessment.id), staleTime: 0 }).catch(() => null)
  }
  if (action.kind === 'continue') return <ContinueDraft draftId={action.draftId} />
  if (action.kind === 'blocked')
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">{m.attempt_blocked_heading()}</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          {action.reasons.map(reason => (
            <li key={reason}>{reasons[reason]()}</li>
          ))}
          {state.opens_at_unix ? <li>{m.attempt_opens_at({ date: formatDateTime(state.opens_at_unix) })}</li> : null}
        </ul>
        {/* As the player's card says it (B-PLY-19): a retake is the teacher's call, not a dead end. */}
        {action.reasons.includes('MAX_ATTEMPTS_REACHED') ? (
          <p className="text-sm text-muted-foreground">
            {m.attempt_retake_if()}{' '}
            <Link to="/courses/$courseId/discussions" params={{ courseId: params.courseId }}>
              {m.attempt_retake_ask()}
            </Link>
          </p>
        ) : null}
      </section>
    )
  const begin = () => {
    if (rules.includes('fullscreen')) void document.documentElement.requestFullscreen().catch(() => null)
    start.mutate(
      // The consent to the rules is stored on the attempt (B-ATT-04); without rules there is nothing to accept.
      { path: { assessment_id: assessment.id }, ...(rules.length ? { body: { rules_accepted: true } } : {}) },
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
      {/* A timed test: the learner learns before starting that the clock cannot be paused (B-ATT-02). */}
      {state.effective.time_limit_seconds !== null && !action.revision ? (
        <p className="flex items-start gap-2 text-sm">
          <Timer aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          {m.attempt_clock_starts()}
        </p>
      ) : null}
      {rules.length ? (
        <Field orientation="horizontal">
          <Checkbox id={consentId} checked={agreed} onCheckedChange={checked => setAgreed(checked)} />
          <FieldLabel htmlFor={consentId}>{m.attempt_consent()}</FieldLabel>
        </Field>
      ) : null}
      <SubmitButton onClick={begin} pending={start.isPending} disabled={rules.length > 0 && !agreed}>
        {action.revision ? m.attempt_revise() : m.attempt_start()}
      </SubmitButton>
      {start.error && !refused ? <ErrorAlert>{presentError(start.error)}</ErrorAlert> : null}
    </div>
  )
}
