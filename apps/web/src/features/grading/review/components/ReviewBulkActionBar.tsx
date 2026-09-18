'use client'

import { CalendarClock, Clock3, Download, RotateCcw, Send } from 'lucide-react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import type { Submission } from '@/features/grading/domain'
import { canReturnSubmission, canTeacherEditGrade, getReleaseState } from '@/features/grading/domain'
import { exportGradesCSV, publishAssessmentGrades } from '@/services/grading/grading'
import { extendDeadline, getBulkAction, saveGrade } from '@/lib/api/generated/grading/grading'
import type { BulkAction, GradeRequest } from '@/lib/api/generated/zod'
import { toUnix } from '@/lib/api/contract'
import { ifMatchHeaders } from '@/lib/api/headers'
import { saveBlob } from '@/lib/download'
import { useApiError } from '@/hooks/useApiError'
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
  const format = useFormatter()
  const locale = useLocale()
  const { handleApiError } = useApiError()
  const [isPending, startTransition] = useTransition()
  const [deadlineLocal, setDeadlineLocal] = useState('')
  const [reason, setReason] = useState('')
  const [auditNote, setAuditNote] = useState('')
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [lastSummary, setLastSummary] = useState<BulkActionSummary | null>(null)
  const [deadlineError, setDeadlineError] = useState<string | null>(null)
  const [failedSubmissions, setFailedSubmissions] = useState<{ name: string; error: string }[]>([])

  const gradeable = submissions.filter(submission => submission.final_score !== null)
  // UX-067: rows without a saved score are left out of a bulk publish/return
  // — the dialog and the toast name them instead of claiming a clean run.
  const ungraded = submissions.filter(submission => submission.final_score === null)
  const ungradedNames = ungraded.map(displayName).join(', ')
  // BUG-125: the server's transition table — a PUBLISHED row can only be
  // re-published, never returned; such rows are left out of the bulk return.
  const eligible = (status: 'PUBLISHED' | 'RETURNED') =>
    gradeable.filter(submission =>
      status === 'RETURNED' ? canReturnSubmission(submission.status) : canTeacherEditGrade(submission.status),
    )
  const returnable = eligible('RETURNED')
  const userIds = submissions
    .map(submission => submission.user?.id)
    .filter((id): id is string => typeof id === 'string')
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
  const actionNeedsAuditNote =
    pendingAction === 'publish-selected' || pendingAction === 'return-selected' || pendingAction === 'release-hidden'
  const auditNoteValid = !actionNeedsAuditNote || auditNote.trim().length >= 8

  const bulkUpdate = (status: 'PUBLISHED' | 'RETURNED') => {
    const targets = eligible(status)
    if (targets.length === 0) {
      toast.error(t('toasts.needsSavedScores'))
      return
    }
    startTransition(async () => {
      const result = await saveGrades(targets, status, auditNote.trim(), error => handleApiError(error).message)
      setFailedSubmissions(result.failures)
      const failed = result.failures.length > 0
      if (failed) {
        toast.warning(t('toasts.bulkPartialFailure', { failed: result.failures.length }))
      } else if (ungraded.length > 0) {
        toast.warning(
          t(status === 'PUBLISHED' ? 'toasts.publishedWithSkipped' : 'toasts.returnedWithSkipped', {
            count: result.succeeded,
            skipped: ungraded.length,
          }),
        )
      } else {
        toast.success(status === 'PUBLISHED' ? t('toasts.published') : t('toasts.returned'))
      }
      setLastSummary({
        label: failed
          ? t('summaries.finishedWithErrors')
          : status === 'PUBLISHED'
            ? t('summaries.publishFinished')
            : t('summaries.returnFinished'),
        detail: t('summaries.resultDetail', { succeeded: result.succeeded, failed: result.failures.length }),
        tone: failed ? 'warning' : 'success',
      })
      // On failure the dialog stays open: the per-row errors are listed in it.
      if (!failed) {
        setPendingAction(null)
        setAuditNote('')
      }
      await onRefresh()
    })
  }

  // BUG-124: «Продлить» is the server's `deadline-extensions` bulk action (a
  // queued job that also recomputes `is_late`), not a per-learner override.
  const applyDeadline = () => {
    const newDueAtUnix = toUnix(deadlineLocal)
    if (newDueAtUnix === null || userIds.length === 0 || !assessmentUuid) return
    startTransition(async () => {
      try {
        const queued = await extendDeadline(assessmentUuid, {
          user_ids: userIds,
          new_due_at_unix: newDueAtUnix,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        })
        const outcome = await waitForBulkAction(queued)
        const done = outcome.status === 'completed'
        const count = done ? outcome.affected_count : userIds.length
        const detail = t('summaries.deadlineDetail', { count, reason: reason.trim() || t('preview.noReason') })
        if (outcome.status === 'failed') {
          toast.error(t('toasts.extendFailed'))
          setLastSummary({
            label: t('summaries.finishedWithErrors'),
            detail: outcome.error_log || detail,
            tone: 'warning',
          })
          return
        }
        toast.success(done ? t('toasts.deadlineExtended', { count }) : t('toasts.deadlineQueued'))
        setLastSummary({
          label: done ? t('summaries.deadlineExtended') : t('summaries.deadlineQueued'),
          detail,
          tone: 'success',
        })
        setDeadlineLocal('')
        setReason('')
        setAuditNote('')
        setPendingAction(null)
        await onRefresh()
      } catch (error) {
        const processed = handleApiError(error, { fallback: t('toasts.extendFailed') })
        // UX-113: the server's 422 `new_due_at_unix`/`past` lands on the field, not in a generic toast.
        if (processed.fieldErrors.some(fieldError => fieldError.field === 'new_due_at_unix')) {
          setDeadlineError(t('preview.dueDatePast'))
          return
        }
        toast.error(processed.message)
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
        setAuditNote('')
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
      try {
        saveBlob(await exportGradesCSV(assessmentUuid, locale), `grades-assessment-${assessmentUuid}.csv`)
        toast.success(t('toasts.exported'))
      } catch (error) {
        toast.error(handleApiError(error, { fallback: t('toasts.exportFailed') }).message)
      }
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
        disabled={disabled || isPending || returnable.length === 0}
        onClick={() => setPendingAction('return-selected')}
      >
        <RotateCcw className="size-4" />
        {t('returnSelected')}
      </Button>
      {/* UX-093: the bulk return takes saved scores only — say so instead of a mute disabled button. */}
      {submissions.length > 0 && returnable.length === 0 && ungraded.length > 0 ? (
        <span className="text-muted-foreground text-xs">{t('returnNeedsSavedScore')}</span>
      ) : null}
      <Button variant="outline" size="sm" disabled={isPending} onClick={() => setPendingAction('release-hidden')}>
        <Send className="size-4" />
        {t('releaseHidden')}
      </Button>
      <CalendarDateTimePicker
        value={deadlineLocal}
        onChange={value => {
          setDeadlineLocal(value)
          setDeadlineError(null)
        }}
        disabled={disabled || isPending}
        placeholder={t('deadlinePlaceholder')}
        className="w-48"
        // UX-113: a new deadline is in the future — past days are hidden (UX-105 only trimmed the year list).
        minDate={new Date(new Date().setHours(0, 0, 0, 0))}
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
                {ungraded.length > 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {t('preview.notGraded', { count: ungraded.length, names: ungradedNames })}
                  </p>
                ) : null}
                {pendingAction === 'return-selected' && returnable.length < gradeable.length ? (
                  <p className="text-muted-foreground text-xs">
                    {t('preview.notReturnable', { count: gradeable.length - returnable.length })}
                  </p>
                ) : null}
              </>
            ) : null}
            {pendingAction === 'extend-deadline' ? (
              <>
                <PreviewRow label={t('preview.learners')} value={String(userIds.length)} />
                <PreviewRow
                  label={t('preview.newDueDate')}
                  value={
                    deadlineLocal
                      ? format.dateTime(new Date(deadlineLocal), { dateStyle: 'long', timeStyle: 'short' })
                      : t('preview.notSet')
                  }
                />
                {deadlineError ? (
                  <p role="alert" className="text-destructive text-xs">
                    {deadlineError}
                  </p>
                ) : null}
                <div className="space-y-2 rounded-md border p-3">
                  <label htmlFor="bulk-extend-reason" className="text-sm font-medium">
                    {t('preview.reason')}
                  </label>
                  <Input
                    id="bulk-extend-reason"
                    value={reason}
                    placeholder={t('reasonPlaceholder')}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => setReason(event.target.value)}
                  />
                </div>
              </>
            ) : null}
            {actionNeedsAuditNote ? (
              <div className="space-y-2 rounded-md border p-3">
                <label htmlFor="bulk-audit-note" className="text-sm font-medium">
                  {t('auditNote.label')}
                </label>
                <Input
                  id="bulk-audit-note"
                  value={auditNote}
                  placeholder={t('auditNote.placeholder')}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setAuditNote(event.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  {auditNoteValid ? t('auditNote.help') : t('auditNote.tooShort')}
                </p>
              </div>
            ) : null}
            {pendingAction === 'release-hidden' ? (
              // UX-105: the action is assessment-wide — no selection counts here.
              <p className="text-muted-foreground text-xs">{t('preview.releaseHiddenDescription')}</p>
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
              <Button disabled={!auditNoteValid} onClick={() => bulkUpdate('PUBLISHED')}>
                {t('confirmPublish')}
              </Button>
            ) : null}
            {pendingAction === 'return-selected' ? (
              <Button disabled={!auditNoteValid} onClick={() => bulkUpdate('RETURNED')}>
                {t('confirmReturn')}
              </Button>
            ) : null}
            {pendingAction === 'extend-deadline' ? (
              <Button onClick={applyDeadline}>{t('queueExtension')}</Button>
            ) : null}
            {pendingAction === 'release-hidden' ? (
              <Button disabled={!auditNoteValid} onClick={releaseHiddenGrades}>
                {t('releaseGrades')}
              </Button>
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

function displayName(sub: Submission): string {
  return sub.user
    ? `${sub.user.first_name ?? ''} ${sub.user.last_name ?? ''}`.trim() ||
        sub.user.username ||
        sub.user.email ||
        sub.submission_uuid
    : sub.submission_uuid
}

/**
 * One `PATCH submissions/{id}/grade` per row; a rejected row keeps its
 * localized problem message. BUG-138: the row is already graded, so the
 * request carries no score (the server keeps the stored raw score and
 * penalties) and no feedback (kept); the audit note goes to the audit trail.
 */
async function saveGrades(
  submissions: Submission[],
  status: 'PUBLISHED' | 'RETURNED',
  auditNote: string,
  describeError: (error: unknown) => string,
) {
  const results = await Promise.allSettled(
    submissions.map(submission => {
      const body: GradeRequest & { audit_note: string } = {
        action: status === 'PUBLISHED' ? 'publish' : 'return',
        audit_note: auditNote,
      }
      return saveGrade(submission.submission_uuid, body, { headers: ifMatchHeaders(submission.version) })
    }),
  )

  const failures: { name: string; error: string }[] = []
  results.forEach((result, i) => {
    const sub = submissions[i]
    if (result.status !== 'rejected' || !sub) return
    failures.push({ name: displayName(sub), error: describeError(result.reason) })
  })

  return { succeeded: results.length - failures.length, failures }
}

/** Poll the queued bulk action for a few seconds; a still-pending job is reported as queued. */
async function waitForBulkAction(action: BulkAction, attempts = 10): Promise<BulkAction> {
  let current = action
  for (let i = 0; i < attempts && (current.status === 'pending' || current.status === 'running'); i += 1) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    current = await getBulkAction(current.id)
  }
  return current
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
