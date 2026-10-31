import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { ApproveAction, CourseId, GradeDraftView } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { formatNumber } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'
import { toast } from '#/shared/ui/toast'

import { type ApproveFailure, approveFailures } from '../model/ai-draft'
import type { QueueRow } from '../model/queue'
import { approveDraftsOptions } from '../mutations'
import type { Work } from '../queries'
import { outcomeText } from './ai-labels'

type ApproveSelectedProps = {
  work: Work
  courseId: CourseId
  activityId: string
  /** The ready drafts of the selected works. */
  drafts: readonly GradeDraftView[]
  /** The loaded rows: a failure names its learner. */
  rows: readonly QueueRow[]
  /** After the approval the selection keeps only the works that failed, so their reasons stay on screen. */
  onKeep: (ids: string[]) => void
}

const confirmText = {
  save: { title: m.grading_ai_approve_save_title, text: m.grading_ai_approve_save_text, verb: m.grading_ai_save },
  publish: {
    title: m.grading_ai_approve_publish_title,
    text: m.grading_ai_approve_publish_text,
    verb: m.grading_publish,
  },
} satisfies Record<
  ApproveAction,
  { title: () => string; text: (input: { count: string }) => string; verb: () => string }
>

/**
 * «Утвердить выбранные» (B-GRD-42): the selected works' ready AI drafts become their grades, saved or published, in one
 * request; each draft that did not apply (the work changed, not ready, a refused save) is named with its reason.
 */
export function ApproveSelected({ work, courseId, activityId, drafts, rows, onKeep }: ApproveSelectedProps) {
  const [action, setAction] = useState<ApproveAction | null>(null)
  const [failures, setFailures] = useState<ApproveFailure[]>([])
  const approve = useMutation(approveDraftsOptions(work, courseId, activityId))
  const names = new Map(rows.map(row => [row.id, row.user.display_name || row.user.username]))
  const count = formatNumber(drafts.length)
  const text = action ? confirmText[action] : confirmText.save
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" disabled={drafts.length === 0}>
              {m.grading_ai_approve_selected({ count })}
            </Button>
          }
        />
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => setAction('save')}>{m.grading_ai_approve_save()}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAction('publish')}>{m.grading_ai_approve_publish()}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={action !== null}
        onOpenChange={open => {
          if (!open) setAction(null)
        }}
        title={text.title()}
        consequence={text.text({ count })}
        confirmLabel={text.verb()}
        pending={approve.isPending}
        error={approve.error}
        onConfirm={() => {
          if (!action) return
          const items = drafts.map(draft => ({ draft_id: draft.id }))
          approve.mutate(
            { path: { activity_id: activityId }, body: { action, items } },
            {
              onSuccess: outcomes => {
                setAction(null)
                const failed = approveFailures(outcomes, drafts)
                setFailures(failed)
                const applied = outcomes.length - failed.length
                if (applied > 0) toast.add({ title: m.grading_ai_approved({ count: formatNumber(applied) }) })
                onKeep(failed.flatMap(failure => (failure.subjectId ? [failure.subjectId] : [])))
              },
            },
          )
        }}
      />
      {failures.length > 0 ? (
        <ErrorAlert>
          <p>{m.grading_ai_approve_failed({ count: formatNumber(failures.length) })}</p>
          <ul className="list-disc pl-5">
            {failures.map(failure => (
              <li key={failure.draft_id}>
                <span className="font-medium">
                  {(failure.subjectId && names.get(failure.subjectId)) || m.grading_ai_unknown_work()}
                </span>
                {' — '}
                {outcomeText(failure)}
              </li>
            ))}
          </ul>
        </ErrorAlert>
      ) : null}
    </>
  )
}
