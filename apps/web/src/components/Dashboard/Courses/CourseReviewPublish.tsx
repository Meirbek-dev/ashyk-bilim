'use client'

import {
  CourseStatusBadge,
  courseWorkflowCardClass,
  courseWorkflowMutedPanelClass,
  courseWorkflowSummaryCardClass,
} from './courseWorkflowUi'
import { buildCourseWorkspacePath, getCourseContentStats } from '@/lib/course-management'
import type { CourseWorkspaceCapabilities } from '@/lib/course-management-server'
import { useCoursesMutations } from '@/hooks/mutations/useCoursesMutations'
import { ClipboardCheck, ExternalLink, Eye, FileStack, Loader2, Users } from 'lucide-react'
import { useCourse } from '@components/Contexts/CourseContext'
import { getAbsoluteUrl } from '@services/config/config'
import { useCourseEditorStore } from '@/stores/courses'
import { Button } from '@/components/ui/button'
import { useEffect, useState, useTransition } from 'react'
import AppLink from '@/components/ui/AppLink'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

const courseReviewCopy = {
  learnerPreview: {
    title: 'Preview as learner',
    description: 'Open the learner-facing course page and confirm the first learning path reads correctly.',
    action: 'Preview as Learner',
    done: 'Preview Complete',
  },
  impactSummary: 'Publish Impact',
  impactRows: {
    visibility: 'Learner visibility',
    curriculum: 'Curriculum',
    contributors: 'Contributors',
    blockers: 'Open blockers',
    preview: 'Learner preview',
  },
  curriculumImpact: '{chapters} chapters / {activities} activities',
  visibilityLive: 'Course is visible to learners.',
  visibilityPrivate: 'Course is private until you publish.',
  blockerCount: '{count} blockers',
  noBlockers: 'No blockers',
  previewRequired: 'Required before publish',
  previewCompleted: 'Completed',
}

export default function CourseReviewPublish({
  courseuuid,
  capabilities,
}: {
  courseuuid: string
  capabilities: CourseWorkspaceCapabilities
}) {
  const t = useTranslations('DashPage.CourseManagement.Review')
  const tReadiness = useTranslations('DashPage.CourseManagement.Readiness')
  const tOverview = useTranslations('DashPage.CourseManagement.Overview')
  const course = useCourse()
  const { updateAccess } = useCoursesMutations(course.courseStructure.course_uuid, true)
  const setConflict = useCourseEditorStore(state => state.setConflict)
  const { readiness } = course
  const stats = getCourseContentStats(course.courseStructure)
  const contributors = course.editorData.contributors.data ?? []
  const contributorNameItems = contributors
    .slice(0, 3)
    .map((contributor: AppCourseAuthor, index: number) => {
      const parts = [contributor?.user?.first_name, contributor?.user?.last_name].filter(Boolean)
      const label = parts.join(' ') || contributor?.user?.username || contributor?.user?.email
      return {
        key: contributor?.user?.user_uuid || contributor?.user?.username || contributor?.id || `contributor-${index}`,
        label,
      }
    })
    .filter(item => item.label)
  const [isPending, startTransition] = useTransition()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const previewStorageKey = `course:${course.courseStructure.course_uuid}:learner-previewed`
  const [learnerPreviewComplete, setLearnerPreviewComplete] = useState(false)

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setLearnerPreviewComplete(globalThis.localStorage.getItem(previewStorageKey) === '1')
    }, 0)
    return () => globalThis.clearTimeout(timer)
  }, [previewStorageKey])

  const markLearnerPreviewComplete = () => {
    globalThis.localStorage.setItem(previewStorageKey, '1')
    setLearnerPreviewComplete(true)
  }

  const learnerPreviewHref = `${getAbsoluteUrl(`/course/${courseuuid}`)}?preview=learner`
  const expandedChecklist = [
    ...readiness.checklist.map(item => ({
      ...item,
      title: tReadiness(`checklist.${item.id}.title`),
      description: tReadiness(`checklist.${item.id}.description`),
    })),
    {
      id: 'learner-preview',
      complete: learnerPreviewComplete,
      title: courseReviewCopy.learnerPreview.title,
      description: courseReviewCopy.learnerPreview.description,
      href: null,
    },
  ]
  const openBlockers = expandedChecklist.filter(item => !item.complete).length
  const canPublish = readiness.readyToPublish && learnerPreviewComplete

  const toggleVisibility = () => {
    if (!capabilities.canManageAccess) {
      return
    }

    const wasPublic = course.courseStructure.public

    startTransition(() => {
      void (async () => {
        try {
          setIsRefreshing(true)
          await updateAccess(
            { public: !wasPublic },
            {
              lastKnownUpdateDate: course.courseStructure.update_date,
            },
          )
          toast.success(wasPublic ? t('toasts.movedPrivate') : t('toasts.published'))
        } catch (error: unknown) {
          const apiError = error as AppApiError
          if (apiError.status === 409) {
            setConflict({
              serverVersion: course.courseStructure,
              message: String(apiError.detail || apiError.message || ''),
              pendingSave: async () => {
                await updateAccess(
                  { public: !wasPublic },
                  {
                    lastKnownUpdateDate: course.courseStructure.update_date,
                  },
                )
              },
            })
            return
          }
          toast.error(apiError.message || t('errors.visibilityUpdate'))
        } finally {
          setIsRefreshing(false)
        }
      })()
    })
  }

  return (
    <div className="space-y-6">
      <div className={`${courseWorkflowCardClass} p-6`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              {t('sectionLabel')}
            </div>
            <h2 className="text-foreground mt-2 text-2xl font-semibold tracking-tight">
              {readiness.readyToPublish ? t('readyTitle') : t('notReadyTitle')}
            </h2>
            <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-6">{t('description')}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <a
                  href={getAbsoluteUrl(`/course/${courseuuid}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('previewPublicPage')}
                />
              }
            >
              <ExternalLink className="size-4" />
              {t('previewPublicPage')}
            </Button>
            {capabilities.canManageAccess ? (
              <Button
                onClick={toggleVisibility}
                disabled={isPending || isRefreshing || (!course.courseStructure.public && !canPublish)}
              >
                {isPending || isRefreshing ? <Loader2 className="size-4 animate-spin" /> : null}
                {course.courseStructure.public ? t('movePrivate') : t('publishCourse')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className={`${courseWorkflowCardClass} p-5`}>
          <div className="text-foreground text-sm font-semibold">{t('readinessChecklist')}</div>
          <div className="mt-4 space-y-3">
            {expandedChecklist.map(item => (
              <div key={item.id} className="bg-muted/40 flex items-start justify-between gap-4 rounded-lg border p-4">
                <div>
                  <div className="text-foreground font-medium">{item.title}</div>
                  <div className="text-muted-foreground mt-1 text-sm">{item.description}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <CourseStatusBadge status={item.complete ? 'ready' : 'needs-review'} />
                  {item.href ? (
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={<AppLink href={buildCourseWorkspacePath(courseuuid, item.href)} />}
                    >
                      {t('openAction')}
                    </Button>
                  ) : item.id === 'learner-preview' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={
                        <a
                          href={learnerPreviewHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={courseReviewCopy.learnerPreview.action}
                          onClick={markLearnerPreviewComplete}
                        />
                      }
                    >
                      <Eye data-icon="inline-start" aria-hidden="true" />
                      {learnerPreviewComplete
                        ? courseReviewCopy.learnerPreview.done
                        : courseReviewCopy.learnerPreview.action}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className={courseWorkflowSummaryCardClass}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                {t('launchState')}
              </div>
              <CourseStatusBadge status={course.courseStructure.public ? 'live' : 'private'} />
            </div>
            <div className="text-foreground mt-3 text-3xl font-semibold">
              {course.courseStructure.public ? t('launchStates.live') : t('launchStates.private')}
            </div>
            <div className="text-muted-foreground mt-2 text-sm">
              {course.courseStructure.public ? t('launchStateDescriptions.live') : t('launchStateDescriptions.private')}
            </div>
          </div>

          <div className={courseWorkflowSummaryCardClass}>
            <div className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
              <ClipboardCheck className="size-4" aria-hidden="true" />
              {courseReviewCopy.impactSummary}
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              <ImpactRow
                label={courseReviewCopy.impactRows.visibility}
                value={
                  course.courseStructure.public ? courseReviewCopy.visibilityLive : courseReviewCopy.visibilityPrivate
                }
              />
              <ImpactRow
                label={courseReviewCopy.impactRows.curriculum}
                value={courseReviewCopy.curriculumImpact
                  .replace('{chapters}', String(stats.chapters))
                  .replace('{activities}', String(stats.activities))}
              />
              <ImpactRow label={courseReviewCopy.impactRows.contributors} value={String(contributors.length)} />
              <ImpactRow
                label={courseReviewCopy.impactRows.blockers}
                value={
                  openBlockers === 0
                    ? courseReviewCopy.noBlockers
                    : courseReviewCopy.blockerCount.replace('{count}', String(openBlockers))
                }
              />
              <ImpactRow
                label={courseReviewCopy.impactRows.preview}
                value={learnerPreviewComplete ? courseReviewCopy.previewCompleted : courseReviewCopy.previewRequired}
              />
            </div>
          </div>

          <div className={courseWorkflowSummaryCardClass}>
            <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              {tOverview('workspacePulse')}
            </div>
            <div className="mt-4 grid gap-3">
              <div className={courseWorkflowMutedPanelClass}>
                <div className="text-muted-foreground flex items-center gap-2">
                  <FileStack className="size-4" />
                  {tOverview('curriculumSnapshot')}
                </div>
                <div className="text-foreground mt-2 text-2xl font-semibold">
                  {tOverview('chapterCount', { count: stats.chapters })}
                </div>
                <div className="text-muted-foreground mt-1 text-sm">
                  {tOverview('activityCountDescription', {
                    count: stats.activities,
                  })}
                </div>
              </div>
              <div className={courseWorkflowMutedPanelClass}>
                <div className="text-muted-foreground flex items-center gap-2">
                  <Users className="size-4" />
                  {tOverview('sections.collaboration')}
                </div>
                <div className="text-foreground mt-2 text-2xl font-semibold">{contributors.length}</div>
                <div className="text-muted-foreground mt-1 text-sm">
                  {tOverview('collaboration.loadedRecords', {
                    count: contributors.length,
                  })}
                </div>
                {contributorNameItems.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {contributorNameItems.map(contributor => (
                      <span
                        key={contributor.key}
                        className="bg-background text-foreground rounded-full border px-2.5 py-1 text-xs"
                      >
                        {contributor.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className={`${courseWorkflowCardClass} p-5`}>
            <div className="text-foreground text-sm font-semibold">{t('publishingNotes')}</div>
            <div className="text-muted-foreground mt-3 space-y-3 text-sm leading-6">
              <div className={courseWorkflowMutedPanelClass}>{t('notes.visibility')}</div>
              <div className={courseWorkflowMutedPanelClass}>{t('notes.curriculum')}</div>
              <div className={courseWorkflowMutedPanelClass}>{t('notes.review')}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ImpactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 flex items-start justify-between gap-3 rounded-lg border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-44 text-right font-medium text-pretty">{value}</span>
    </div>
  )
}
