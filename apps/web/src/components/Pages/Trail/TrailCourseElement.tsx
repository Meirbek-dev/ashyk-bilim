'use client'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useApiError } from '@/hooks/useApiError'
import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import CoursePlaceholder from '@components/Objects/Thumbnails/CoursePlaceholder'
import { useUserCertificateByCourse } from '@/features/certifications/hooks/useCertifications'
import { CertificatePdfDownloadButton } from '@/features/certifications/components/CertificatePdfDownloadButton'
import { useLearnerCourseProgress } from '@/features/learner-course/useLearnerCourseProgress'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { revalidateTags } from '@/lib/cache/revalidate'
import { ArrowRight, Award, ExternalLink, Loader2, X } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { apiJson } from '@/lib/api-client'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import { getAbsoluteUrl } from '@services/config/config'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from '@components/ui/AppLink'

interface TrailCourseElementProps {
  course: AppCourse
  run: AppTrailRun
}

function TrailCourseElement({ course, run }: TrailCourseElementProps) {
  const queryClient = useQueryClient()
  const courseid = course.course_uuid.replace('course_', '')
  const router = useRouter()
  const t = useTranslations('Trail')
  const tCourse = useTranslations('CoursePage')
  // Trail `steps` are lesson-type only; completion comes from learner-state.
  const learnerProgress = useLearnerCourseProgress(courseid)
  const course_total_steps = learnerProgress.isLoaded ? learnerProgress.total : (run.course_total_steps ?? 0)
  const course_completed_steps = learnerProgress.isLoaded ? learnerProgress.completed : 0
  const course_progress = learnerProgress.isLoaded ? learnerProgress.percent : 0
  const isCompleted = course_progress === 100
  // UX-252: a course with no certification shows no certificate row at all;
  // «недоступен» is for one that certifies but has not issued yet.
  const showCertificate = isCompleted && learnerProgress.certificateConfigured
  const certificateQuery = useUserCertificateByCourse(showCertificate ? course.course_uuid : null)
  const courseCertificate = certificateQuery.data?.data?.[0] ?? null
  const isLoadingCertificate = showCertificate && certificateQuery.isPending
  const [confirmQuit, setConfirmQuit] = useState(false)
  const { toastApiError } = useApiError()

  const quitCourse = useMutation({
    // Client apiJson, not a 'use server' action: the problem+json code must
    // reach the toast (BUG-035 class, UX-140).
    mutationFn: () => apiJson(`trail/courses/${courseid}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setConfirmQuit(false)
      // The card reads the trail query: drop it first so the card goes with the toast (UX-081).
      await queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() })
      toast.success(t('quitCourseDone', { course: course.name ?? '' }))
      await revalidateTags(['courses'])
      router.refresh()
    },
    onError: async error => {
      // UX-140: the run is already gone (left in another tab) — say so, not «Не удалось».
      if (hasErrorCode(error, 'not-found')) toast.info(t('quitCourseAlreadyLeft'))
      else toastApiError(error, { fallback: t('quitCourseFailed') })
      // UX-133: a stale card (already left elsewhere / unpublished) goes away too.
      await queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() })
    },
  })

  return (
    <div
      data-trail-course={courseid}
      className="border-border bg-card flex gap-4 rounded-xl border p-4 transition-shadow hover:shadow-md"
    >
      {/* Thumbnail */}
      <Link href={getAbsoluteUrl(`/course/${courseid}`)} className="shrink-0" aria-label={course.name ?? ''}>
        <div
          className="ring-border relative h-14 w-20 overflow-hidden rounded-lg bg-cover bg-center ring-1 ring-inset sm:h-[76px] sm:w-[108px]"
          style={
            course.thumbnail_image
              ? {
                  backgroundImage: `url(${getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)})`,
                }
              : undefined
          }
        >
          {course.thumbnail_image ? null : <CoursePlaceholder seed={courseid} title={course.name ?? ''} compact />}
        </div>
      </Link>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={getAbsoluteUrl(`/course/${courseid}`)}>
              <h3 className="text-foreground hover:text-primary line-clamp-2 text-base leading-snug font-semibold transition-colors">
                {course.name}
              </h3>
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setConfirmQuit(true)}
            aria-label={t('quitCourseButton')}
            title={t('quitCourseButton')}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
          >
            <X className="h-3 w-3" />
            <span className="hidden sm:inline">{t('quitCourseButton')}</span>
          </button>
        </div>

        {/* Progress — UX-232: nothing required yet reads like the landing, not «0 / 0 шагов». */}
        {learnerProgress.isLoaded && course_total_steps === 0 ? (
          <p className="text-muted-foreground text-xs">{tCourse('noPublishedActivities')}</p>
        ) : (
          <div className="space-y-1.5">
            <div className="text-muted-foreground flex items-center justify-between text-xs">
              <span className="tabular-nums">
                {t('stepsProgress', {
                  completed: course_completed_steps,
                  total: course_total_steps,
                })}
              </span>
              <span className={cn('tabular-nums font-semibold', isCompleted ? 'text-primary' : 'text-foreground')}>
                {course_progress}%
              </span>
            </div>
            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${course_progress}%` }}
              />
            </div>
          </div>
        )}

        {!isCompleted && learnerProgress.nextActivityId && (
          <div>
            <Link
              href={getAbsoluteUrl(`/course/${courseid}/activity/${learnerProgress.nextActivityId}`)}
              className={buttonVariants({ size: 'sm' })}
            >
              {t('continue')}
              <ArrowRight data-icon="inline-end" />
            </Link>
          </div>
        )}

        {/* Certificate */}
        {showCertificate && (
          <div className="flex flex-wrap items-center gap-1.5">
            {isLoadingCertificate ? (
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('loadingCertificate')}
              </span>
            ) : courseCertificate ? (
              <>
                <Link
                  href={getAbsoluteUrl(
                    `/certificates/${courseCertificate.certificate_user.user_certification_uuid}/verify`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-border text-foreground hover:bg-muted/60 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                >
                  <Award className="text-primary h-3.5 w-3.5" />
                  {t('viewCertificate')}
                  <ExternalLink className="text-muted-foreground h-3 w-3" />
                </Link>
                <CertificatePdfDownloadButton
                  verifyCode={courseCertificate.certificate_user.user_certification_uuid}
                  size="sm"
                  variant="outline"
                  className="h-auto px-2.5 py-1 text-xs"
                />
              </>
            ) : (
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                <Award className="text-muted-foreground/40 h-3 w-3" />
                {t('noCertificateAvailable')}
              </span>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={confirmQuit} onOpenChange={open => !open && setConfirmQuit(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('quitCourseConfirmTitle', { course: course.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('quitCourseConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('quitCourseCancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={quitCourse.isPending}
              onClick={() => quitCourse.mutate()}
            >
              {t('quitCourseButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default TrailCourseElement
