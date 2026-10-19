import type { StudentSubmission } from '#/shared/api/gen/types.gen'
import { m } from '#/paraglide/messages'
import { SubmitButton } from '#/shared/components/submit-button'

import { AttemptTimer } from './attempt-timer'

type ActionsProps = {
  left: number | null
  attempt: StudentSubmission
  receivedAt: number
  pending: boolean
  /** Opens the confirmation (which rereads the draft, B-ATT-16). */
  onSubmit: () => void
}

/** The top bar's clock and «Сдать»; opening the confirmation rereads the draft (B-ATT-16). */
export function RunnerActions({ left, attempt, receivedAt, pending, onSubmit }: ActionsProps) {
  return (
    <>
      {left === null ? null : <AttemptTimer seconds={left} attempt={attempt} receivedAt={receivedAt} />}
      <SubmitButton onClick={onSubmit} pending={pending}>
        {m.attempt_submit()}
      </SubmitButton>
    </>
  )
}
