import { useParams, useSearch } from '@tanstack/react-router'
import { useEffect, useEffectEvent, useState } from 'react'

import type { AssessmentDetail, StudentSubmission } from '#/shared/api/gen/types.gen'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'

import { runsToDueDate, unanswered } from '../model/attempt'
import { AttemptFrame, ATTEMPT_ROUTE } from './attempt-frame'
import { ItemNavigator } from './item-navigator'
import { ItemPager } from './item-pager'
import { ItemView } from './item-view'
import { ReturnNote } from './return-note'
import { RunnerActions } from './runner-actions'
import { RunnerAlerts } from './runner-alerts'
import { SaveIndicator } from './save-indicator'
import { SubmitDialog } from './submit-dialog'
import { useAttemptDraft, useDraftReread } from './use-attempt-draft'
import { useCountdown } from './use-countdown'
import { useExamGuard } from './use-exam-guard'
import { useSubmitAttempt } from './use-submit-attempt'

type RunnerProps = { assessment: AssessmentDetail; attempt: StudentSubmission; receivedAt: number }

/**
 * An open draft (B-ATT-06..17, B-ATT-21): one question at a time from `?item`, the list of questions left, the save
 * indicator and the server's clock in the top bar: the time limit or a strict due date, whichever comes first. At zero
 * the attempt is handed in with what the queue holds.
 */
export function AttemptRunner({ assessment, attempt, receivedAt }: RunnerProps) {
  const { courseId } = useParams({ from: ATTEMPT_ROUTE })
  const { item = 1 } = useSearch({ from: ATTEMPT_ROUTE })
  const draft = useAttemptDraft(attempt)
  const { reread, rereading } = useDraftReread(attempt)
  const submit = useSubmitAttempt(attempt, courseId)
  const guard = useExamGuard(assessment.policy, attempt)
  const left = useCountdown(attempt.time_remaining_seconds, receivedAt)
  const [contentsOpen, setContentsOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const items = assessment.items
  const current = Math.min(Math.max(item, 1), items.length)
  const shown = items[current - 1]
  const expired = left === 0
  // The clock runs to the time limit or a strict due date, whichever comes first (the server says which).
  const due = runsToDueDate(attempt.time_remaining_reason)
  // Handed in, or reopened on a changed test («Тест изменился»): the confirmation closes either way.
  const handIn = () => submit.handIn(() => setConfirming(false))
  const timeUp = useEffectEvent(handIn)
  useEffect(() => {
    if (expired) timeUp()
  }, [expired])
  return (
    <AttemptFrame
      title={assessment.title}
      saveStatus={<SaveIndicator status={draft.status} />}
      actions={
        <RunnerActions
          left={left}
          attempt={attempt}
          receivedAt={receivedAt}
          pending={submit.pending}
          onSubmit={() => setConfirming(true)}
          refresh={reread}
        />
      }
      contents={
        <ItemNavigator items={items} answers={draft.answers} current={current} onPick={() => setContentsOpen(false)} />
      }
      contentsSheet={{ open: contentsOpen, onOpenChange: setContentsOpen }}
    >
      <article className="flex flex-col gap-gutter">
        <RunnerAlerts
          guard={guard}
          closed={draft.closed}
          expired={expired ? (due ? 'due' : 'time') : null}
          changed={submit.changed}
          attemptId={attempt.id}
        />
        <ReturnNote attempt={attempt} />
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
        pending={submit.pending || rereading}
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
