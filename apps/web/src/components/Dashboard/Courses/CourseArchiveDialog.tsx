'use client'

import { Archive, ArchiveRestore, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useApiError } from '@/hooks/useApiError'
import { useCourseArchivePreview } from '@/lib/api/generated/courses/courses'
import type { CourseArchivePreview } from '@/lib/api/generated/zod'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import { setCourseArchived } from '@services/courses/course-writes'

interface CourseArchiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  courseUuid: string
  courseName: string
  /** After the server accepted the change (the dialog already closed itself). */
  onDone?: () => void
}

const PREVIEW_ROWS = [
  ['learners_in_progress', 'learnersInProgress'],
  ['ungraded_submissions', 'ungradedSubmissions'],
  ['open_attempts', 'openAttempts'],
  ['scheduled_assessments', 'scheduledAssessments'],
] as const satisfies readonly (readonly [keyof CourseArchivePreview, string])[]

/**
 * Lifecycle `archive` / `restore` with its confirm (COURSE_ARCHIVING 9.2).
 * A 409 `conflict` means someone else already did it: refresh, no error.
 */
function useCourseLifecycleTransition(courseUuid: string, archived: boolean, onDone: (() => void) | undefined) {
  const t = useTranslations('DashPage.CourseManagement.Archive')
  const router = useRouter()
  const { toastApiError } = useApiError()
  const [isPending, startTransition] = useTransition()

  const run = (close: () => void) =>
    startTransition(async () => {
      try {
        await setCourseArchived(courseUuid, archived)
        toast.success(archived ? t('archived') : t('restored'))
        close()
        onDone?.()
        router.refresh()
      } catch (error) {
        if (hasErrorCode(error, 'conflict')) {
          toast.info(t('alreadyChanged'))
          close()
          router.refresh()
          return
        }
        toastApiError(error)
      }
    })

  return { isPending, run }
}

export function CourseArchiveDialog({ open, onOpenChange, courseUuid, courseName, onDone }: CourseArchiveDialogProps) {
  const t = useTranslations('DashPage.CourseManagement.Archive')
  const { isPending, run } = useCourseLifecycleTransition(courseUuid, true, onDone)
  const preview = useCourseArchivePreview(courseUuid, { query: { enabled: open } })
  const rows = preview.data
    ? PREVIEW_ROWS.filter(([field]) => preview.data[field] > 0).map(([field, key]) => (
        <li key={field}>{t(key, { count: preview.data[field] })}</li>
      ))
    : []

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-muted text-foreground">
            <Archive className="size-8" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t('archiveTitle', { courseName })}</AlertDialogTitle>
          <AlertDialogDescription render={<div />}>
            {preview.isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t('previewLoading')}
              </span>
            ) : preview.isError ? (
              <span>{t('previewUnavailable')}</span>
            ) : rows.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-left">{rows}</ul>
            ) : null}
            <p className={rows.length > 0 || preview.isPending || preview.isError ? 'mt-3' : ''}>{t('summary')}</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} />
          <AlertDialogAction disabled={isPending} onClick={() => run(() => onOpenChange(false))}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t('confirmArchive')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function CourseRestoreDialog({ open, onOpenChange, courseUuid, courseName, onDone }: CourseArchiveDialogProps) {
  const t = useTranslations('DashPage.CourseManagement.Archive')
  const { isPending, run } = useCourseLifecycleTransition(courseUuid, false, onDone)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-muted text-foreground">
            <ArchiveRestore className="size-8" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t('restoreTitle', { courseName })}</AlertDialogTitle>
          <AlertDialogDescription>{t('restoreDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} />
          <AlertDialogAction disabled={isPending} onClick={() => run(() => onOpenChange(false))}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t('confirmRestore')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
