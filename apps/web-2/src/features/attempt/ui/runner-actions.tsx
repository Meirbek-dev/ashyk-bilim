import type { StudentSubmission } from '#/shared/api/gen/types.gen'
import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'

import { AttemptTimer } from './attempt-timer'

type ActionsProps = {
  left: number | null
  attempt: StudentSubmission
  receivedAt: number
  pending: boolean
  onSubmit: () => void
  refresh: () => Promise<void>
}

/** The top bar's clock and «Сдать»; opening the confirmation rereads the draft (B-ATT-16). */
export function RunnerActions({ left, attempt, receivedAt, pending, onSubmit, refresh }: ActionsProps) {
  return (
    <>
      {left === null ? null : <AttemptTimer seconds={left} attempt={attempt} receivedAt={receivedAt} />}
      <Button
        onClick={() => {
          onSubmit()
          void refresh()
        }}
        disabled={pending}
      >
        {m.attempt_submit()}
      </Button>
    </>
  )
}
