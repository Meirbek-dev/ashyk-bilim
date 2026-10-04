import { useParams, useSearch } from '@tanstack/react-router'
import { useEffect, useEffectEvent, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail, StudentSubmission } from '#/shared/api/gen/types.gen'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { unanswered } from '../model/attempt'
import { AttemptFrame, ATTEMPT_ROUTE } from './attempt-frame'
import { AttemptTimer } from './attempt-timer'
import { ItemNavigator } from './item-navigator'
import { ItemPager } from './item-pager'
import { ItemView } from './item-view'
import { RunnerAlerts } from './runner-alerts'
import { SaveIndicator } from './save-indicator'
import { SubmitDialog } from './submit-dialog'
import { useAttemptDraft } from './use-attempt-draft'
import { useCountdown } from './use-countdown'
import { useExamGuard } from './use-exam-guard'
import { useSubmitAttempt } from './use-submit-attempt'

type RunnerProps = { assessment: AssessmentDetail; attempt: StudentSubmission; receivedAt: number }

/**
 * An open draft (B-ATT-06..17, B-ATT-21): one question at a time from `?item`, the list of questions left, the save
 * indicator and the server's clock in the top bar. At zero the attempt is handed in with what the queue holds.
 */
export function AttemptRunner({ assessment, attempt, receivedAt }: RunnerProps) {
  const { courseId } = useParams({ from: ATTEMPT_ROUTE })
  const { item = 1 } = useSearch({ from: ATTEMPT_ROUTE })
  const draft = useAttemptDraft(attempt)
  const submit = useSubmitAttempt(attempt, courseId)
  const guard = useExamGuard(assessment.policy, attempt)
  const left = useCountdown(attempt.time_remaining_seconds, receivedAt)
  const [contentsOpen, setContentsOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const items = assessment.items
  const current = Math.min(Math.max(item, 1), items.length)
  const shown = items[current - 1]
  const expired = left === 0
  const handIn = () =>
    submit.handIn(() => {
      setConfirming(false)
      toast.add({ title: m.attempt_submitted() })
    })
  const timeUp = useEffectEvent(handIn)
  useEffect(() => {
    if (expired) timeUp()
  }, [expired])
  const actions = (
    <>
      {left === null ? null : <AttemptTimer seconds={left} />}
      <Button onClick={() => setConfirming(true)} disabled={submit.pending}>
        {m.attempt_submit()}
      </Button>
    </>
  )
  return (
    <AttemptFrame
      title={assessment.title}
      saveStatus={<SaveIndicator status={draft.status} />}
      actions={actions}
      contents={
        <ItemNavigator items={items} answers={draft.answers} current={current} onPick={() => setContentsOpen(false)} />
      }
      contentsSheet={{ open: contentsOpen, onOpenChange: setContentsOpen }}
    >
      <article className="flex flex-col gap-gutter">
        <RunnerAlerts
          guard={guard}
          closed={draft.closed}
          expired={expired}
          changed={submit.changed}
          attemptId={attempt.id}
        />
        {shown ? (
          <ItemView
            key={shown.id}
            item={shown}
            number={current}
            total={items.length}
            answer={draft.answers[shown.id]}
            onChange={answer => draft.change(shown.id, answer)}
            disabled={draft.closed !== null || expired || submit.pending}
          />
        ) : null}
        <ItemPager current={current} total={items.length} />
      </article>
      <SubmitDialog
        open={confirming}
        onOpenChange={setConfirming}
        unanswered={unanswered(items, draft.answers)}
        onSubmit={handIn}
        pending={submit.pending}
        error={submit.error}
      />
      <ConflictDialog
        open={draft.conflict}
        onOpenChange={draft.setConflict}
        onRetry={() => void draft.reloadAndRetry()}
        pending={false}
      />
    </AttemptFrame>
  )
}
