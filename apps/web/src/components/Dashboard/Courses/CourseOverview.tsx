'use client'

import { BarChart3, CheckCircle2, Circle, ArrowRight, Eye, FileCog, FileStack, Globe, Star, Table2 } from 'lucide-react'
import { buildCourseWorkspacePath, cleanCourseUuid } from '@/lib/course-management'
import { useCourse } from '@components/Contexts/CourseContext'
import { Button } from '@/components/ui/button'
import AppLink from '@/components/ui/AppLink'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

export default function CourseOverview({ courseuuid }: { courseuuid: string }) {
  const t = useTranslations('DashPage.CourseManagement.Overview')
  const { readiness, courseStructure } = useCourse()
  const checklist = readiness.checklist

  const taskConfig = [
    {
      id: 'details',
      label: t('tasks.details.label'),
      description: t('tasks.details.description'),
      href: buildCourseWorkspacePath(courseuuid, 'details'),
      icon: FileCog,
    },
    {
      id: 'curriculum',
      label: t('tasks.curriculum.label'),
      description: t('tasks.curriculum.description'),
      href: buildCourseWorkspacePath(courseuuid, 'curriculum'),
      icon: FileStack,
    },
    {
      id: 'access',
      label: t('tasks.access.label'),
      description: t('tasks.access.description'),
      href: buildCourseWorkspacePath(courseuuid, 'access'),
      icon: Globe,
    },
    {
      id: 'review',
      label: t('tasks.review.label'),
      description: t('tasks.review.description'),
      href: buildCourseWorkspacePath(courseuuid, 'review'),
      icon: Star,
    },
  ]

  // UX-206: «review» is the publish step — done once the course is public (it is
  // not a readiness check: a private course can be ready to publish).
  const completedIds = new Set<string>(checklist.filter(c => c.complete).map(c => c.id))
  if (courseStructure.public) completedIds.add('review')

  const firstIncompleteTask = taskConfig.find(task => !completedIds.has(task.id))
  const isLive = Boolean(courseStructure.public)
  // A live course: the day-to-day places first; the setup list keeps only what is left.
  const visibleTasks = isLive ? taskConfig.filter(task => !completedIds.has(task.id)) : taskConfig
  const cleanId = cleanCourseUuid(courseuuid)
  const liveLinks = [
    { href: buildCourseWorkspacePath(courseuuid, 'gradebook'), label: t('live.gradebook'), icon: Table2 },
    { href: `/dash/analytics/courses/${cleanId}`, label: t('live.analytics'), icon: BarChart3 },
    { href: `/course/${cleanId}`, label: t('live.learnerView'), icon: Eye },
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {isLive ? (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-foreground text-sm font-semibold">{t('live.heading')}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t('live.description')}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {liveLinks.map(link => (
              <AppLink
                key={link.href}
                href={link.href}
                className="hover:bg-muted/40 flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors"
              >
                <link.icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                {link.label}
              </AppLink>
            ))}
          </div>
        </div>
      ) : null}

      {visibleTasks.length > 0 ? (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-foreground text-sm font-semibold">
            {isLive ? t('live.improveHeading') : t('nextStepsHeading')}
          </h2>
          {isLive ? null : <p className="text-muted-foreground mt-1 text-sm">{t('nextStepsDescription')}</p>}

          <div className="mt-4 flex flex-col gap-2">
            {visibleTasks.map(task => {
              const complete = completedIds.has(task.id)
              const Icon = task.icon
              return (
                <AppLink
                  key={task.id}
                  href={task.href}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/40',
                    complete ? 'border-border opacity-60' : 'border-border',
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {complete ? (
                      <CheckCircle2 className="text-primary size-4" aria-label={t('completed')} />
                    ) : (
                      <Circle className="text-muted-foreground size-4" aria-hidden />
                    )}
                  </div>
                  <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        'text-sm font-medium',
                        complete ? 'text-muted-foreground line-through' : 'text-foreground',
                      )}
                    >
                      {task.label}
                    </div>
                    <div className="text-muted-foreground mt-0.5 text-xs">{task.description}</div>
                  </div>
                  {!complete && <ArrowRight className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />}
                </AppLink>
              )
            })}
          </div>
        </div>
      ) : null}

      {firstIncompleteTask && !isLive && (
        <div className="flex justify-end">
          <Button nativeButton={false} render={<AppLink href={firstIncompleteTask.href} />}>
            {t('continueSetup')}
            <ArrowRight className="ml-2 size-4" aria-hidden />
          </Button>
        </div>
      )}
    </div>
  )
}
