'use client'

import { CalendarClock, Clock3, Download, RotateCcw, Send } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import type { Submission } from '@/features/grading/domain'
import { getReleaseState } from '@/features/grading/domain'
import { exportGradesCSV, publishAssessmentGrades, saveGrade } from '@/services/grading/grading'
import { createStudentPolicyOverride } from '@/services/assessments/assessment-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { CalendarDateTimePicker } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type PendingAction = 'publish-selected' | 'return-selected' | 'extend-deadline' | 'release-hidden' | null

interface BulkActionSummary {
  label: string
  detail: string
  tone: 'default' | 'success' | 'warning'
}

export default function ReviewBulkActionBar({
  activityId: _activityId,
  assessmentUuid,
  submissions,
  disabled,
  onRefresh,
}: {
  activityId: number
  assessmentUuid?: string
  submissions: Submission[]
  disabled: boolean
  onRefresh: () => Promise<void>
}) {
  const t = useTranslations('Features.Grading.Review.bulkActions')
  const [isPending, startTransition] = useTransition()
  const [deadlineLocal, setDeadlineLocal] = useState('')
  const [reason, setReason] = useState('')
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [lastSummary, setLastSummary] = useState<BulkActionSummary | null>(null)
  const [failedSubmissions, setFailedSubmissions] = useState<{ name: string; error: string }[]>([])

  const gradeable = submissions.filter(submission => submission.final_score !== null)
  const userIds = submissions.map(submission => submission.user?.id).filter((id): id is number => Number.isFinite(id))
  const releaseSummary = useMemo(() => {
    let visible = 0
    let hidden = 0
    for (const submission of submissions) {
      const releaseState =
        'release_state' in submission && submission.release_state
          ? submission.release_state
          : getReleaseState(submission.status)
      if (releaseState === 'VISIBLE' || releaseState === 'RETURNED_FOR_REVISION') {
        visible += 1
      } else {
        hidden += 1
      }
    }
    return { visible, hidden }
  }, [submissions])

  const bulkUpdate = (status: 'PUBLISHED' | 'RETURNED') => {
    if (gradeable.length === 0) {
      toast.error(t('toasts.needsSavedScores'))
      return
    }
    if (!assessmentUuid) {
      toast.error(t('toasts.bulkActionFailed'))
      return
    }
    startTransition(async () => {
      try {
        const result = await saveGradesWithinAssessment(assessmentUuid, gradeable, status)
        setFailedSubmissions(result.failures)
        if (result.failures.length > 0) {
          toast.warning(t('toasts.bulkPartialFailure', { failed: result.failures.length }))
        } else {
          toast.success(status === 'PUBLISHED' ? t('toasts.published') : t('toasts.returned'))
        }
        setLastSummary({
          label: status === 'PUBLISHED' ? t('summaries.publishFinished') : t('summaries.returnFinished'),
          detail: t('summaries.resultDetail', {
            succeeded: result.succeeded,
            failed: result.failed,
          }),
          tone: result.failed > 0 ? 'warning' : 'success',
        })
        setPendingAction(null)
        await onRefresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('toasts.bulkActionFailed'))
      }
    })
  }

  const applyDeadline = () => {
    if (!deadlineLocal || userIds.length === 0 || !assessmentUuid) return
    startTransition(async () => {
      try {
        await Promise.all(
          userIds.map(userId =>
            createStudentPolicyOverride(assessmentUuid, {
              user_id: userId,
              due_at_override: new Date(deadlineLocal).toISOString(),
              note: reason,
            }),
          ),
        )
        toast.success(t('toasts.deadlineQueued'))
        setLastSummary({
          label: t('summaries.deadlineQueued'),
          detail: t('summaries.deadlineDetail', {
            count: userIds.length,
            reason: reason || '',
          }),
          tone: 'success',
        })
        setDeadlineLocal('')
        setReason('')
        setPendingAction(null)
        await onRefresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('toasts.extendFailed'))
      }
    })
  }

  const releaseHiddenGrades = () => {
    if (!assessmentUuid) {
      toast.error(t('toasts.releaseFailed'))
      return
    }
    startTransition(async () => {
      try {
        const result = await publishAssessmentGrades(assessmentUuid)
        toast.success(t('toasts.hiddenReleased'))
        setLastSummary({
          label: t('summaries.releaseFinished'),
          detail: t('summaries.releaseDetail', {
            published: result.published_count,
            alreadyVisible: result.already_published_count,
          }),
          tone: 'success',
        })
        setPendingAction(null)
        await onRefresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('toasts.releaseFailed'))
      }
    })
  }

  const exportCsv = () => {
    if (!assessmentUuid) {
      toast.error(t('toasts.bulkActionFailed'))
      return
    }
    startTransition(async () => {
      const csv = await exportGradesCSV(assessmentUuid)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `grades-assessment-${assessmentUuid}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">{t('selectedCount', { count: submissions.length })}</Badge>
      <Badge variant="outline">{t('hiddenCount', { count: releaseSummary.hidden })}</Badge>
      <Badge variant="outline">{t('visibleCount', { count: releaseSummary.visible })}</Badge>
      {isPending ? (
        <Badge variant="warning">
          <Clock3 className="size-3" />
          {t('running')}
        </Badge>
      ) : null}
      {lastSummary ? (
        <Badge
          variant={lastSummary.tone === 'warning' ? 'warning' : lastSummary.tone === 'success' ? 'success' : 'outline'}
        >
          {lastSummary.label}
        </Badge>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || isPending || gradeable.length === 0}
        onClick={() => setPendingAction('publish-selected')}
      >
        <Send className="size-4" />
        {t('publishSelected')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || isPending || gradeable.length === 0}
        onClick={() => setPendingAction('return-selected')}
      >
        <RotateCcw className="size-4" />
        {t('returnSelected')}
      </Button>
      <Button variant="outline" size="sm" disabled={isPending} onClick={() => setPendingAction('release-hidden')}>
        <Send className="size-4" />
        {t('releaseHidden')}
      </Button>
      <CalendarDateTimePicker
        value={deadlineLocal}
        onChange={setDeadlineLocal}
        disabled={disabled || isPending}
        className="w-48"
      />
      <Input
        value={reason}
        disabled={disabled || isPending}
        placeholder={t('reasonPlaceholder')}
        className="w-40"
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setReason(event.target.value)}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || isPending || !deadlineLocal || userIds.length === 0 || !assessmentUuid}
        onClick={() => setPendingAction('extend-deadline')}
      >
        <CalendarClock className="size-4" />
        {t('extend')}
      </Button>
      <Button variant="outline" size="sm" disabled={isPending} onClick={exportCsv}>
        <Download className="size-4" />
        {t('export')}
      </Button>

      <Dialog
        open={pendingAction !== null}
        onOpenChange={open => {
          if (!open) setPendingAction(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{getDialogTitle(pendingAction, t)}</DialogTitle>
            <DialogDescription>{getDialogDescription(pendingAction, t)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {pendingAction === 'publish-selected' || pendingAction === 'return-selected' ? (
              <>
                <PreviewRow label={t('preview.selectedSubmissions')} value={String(submissions.length)} />
                <PreviewRow label={t('preview.gradeReady')} value={String(gradeable.length)} />
                <PreviewRow label={t('preview.hiddenFromStudent')} value={String(releaseSummary.hidden)} />
                <PreviewRow label={t('preview.alreadyVisible')} value={String(releaseSummary.visible)} />
              </>
            ) : null}
            {pendingAction === 'extend-deadline' ? (
              <>
                <PreviewRow label={t('preview.learners')} value={String(userIds.length)} />
                <PreviewRow label={t('preview.newDueDate')} value={deadlineLocal || t('preview.notSet')} />
                <PreviewRow label={t('preview.reason')} value={reason || t('preview.noReason')} />
              </>
            ) : null}
            {pendingAction === 'release-hidden' ? (
              <>
                <PreviewRow label={t('preview.selectedHiddenSubmissions')} value={String(releaseSummary.hidden)} />
                <PreviewRow label={t('preview.alreadyVisible')} value={String(releaseSummary.visible)} />
                <p className="text-muted-foreground text-xs">{t('preview.releaseHiddenDescription')}</p>
              </>
            ) : null}
            {lastSummary ? (
              <p className="text-muted-foreground text-xs">{t('lastResult', { detail: lastSummary.detail })}</p>
            ) : null}
            {failedSubmissions.length > 0 ? (
              <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  {t('failedSubmissionsTitle', {
                    count: failedSubmissions.length,
                  })}
                </p>
                <ul className="space-y-0.5">
                  {failedSubmissions.map(f => (
                    <li key={f.name} className="text-xs text-amber-800 dark:text-amber-300">
                      <span className="font-medium">{f.name}</span>
                      {' — '}
                      {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingAction(null)}>
              {t('cancel')}
            </Button>
            {pendingAction === 'publish-selected' ? (
              <Button onClick={() => bulkUpdate('PUBLISHED')}>{t('confirmPublish')}</Button>
            ) : null}
            {pendingAction === 'return-selected' ? (
              <Button onClick={() => bulkUpdate('RETURNED')}>{t('confirmReturn')}</Button>
            ) : null}
            {pendingAction === 'extend-deadline' ? (
              <Button onClick={applyDeadline}>{t('queueExtension')}</Button>
            ) : null}
            {pendingAction === 'release-hidden' ? (
              <Button onClick={releaseHiddenGrades}>{t('releaseGrades')}</Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

async function saveGradesWithinAssessment(
  assessmentUuid: string,
  submissions: Submission[],
  status: 'PUBLISHED' | 'RETURNED',
) {
  const results = await Promise.allSettled(
    submissions.map(submission =>
      saveGrade(
        submission.submission_uuid,
        {
          final_score: submission.final_score ?? 0,
          status,
          feedback: submission.grading_json?.feedback ?? '',
          item_feedback: [],
        },
        submission.version,
        assessmentUuid,
      ),
    ),
  )

  const failures: { name: string; error: string }[] = []
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const sub = submissions[i]
      if (!sub) return

      const name = sub.user
        ? `${sub.user.first_name ?? ''} ${sub.user.last_name ?? ''}`.trim() ||
          sub.user.username ||
          sub.user.email ||
          sub.submission_uuid
        : sub.submission_uuid

      failures.push({
        name,
        error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
      })
    }
  })

  const succeeded = results.filter(result => result.status === 'fulfilled').length
  return {
    succeeded,
    failed: results.length - succeeded,
    failures,
  }
}

function getDialogTitle(
  action: PendingAction,
  t: ReturnType<typeof useTranslations<'Features.Grading.Review.bulkActions'>>,
): string {
  switch (action) {
    case 'publish-selected': {
      return t('dialogs.publishTitle')
    }
    case 'return-selected': {
      return t('dialogs.returnTitle')
    }
    case 'extend-deadline': {
      return t('dialogs.extendTitle')
    }
    case 'release-hidden': {
      return t('dialogs.releaseTitle')
    }
    default: {
      return t('dialogs.defaultTitle')
    }
  }
}

function getDialogDescription(
  action: PendingAction,
  t: ReturnType<typeof useTranslations<'Features.Grading.Review.bulkActions'>>,
): string {
  switch (action) {
    case 'publish-selected': {
      return t('dialogs.publishDescription')
    }
    case 'return-selected': {
      return t('dialogs.returnDescription')
    }
    case 'extend-deadline': {
      return t('dialogs.extendDescription')
    }
    case 'release-hidden': {
      return t('dialogs.releaseDescription')
    }
    default: {
      return t('dialogs.defaultDescription')
    }
  }
}
