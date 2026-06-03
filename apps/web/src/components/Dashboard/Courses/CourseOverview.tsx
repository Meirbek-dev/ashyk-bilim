'use client'

import { CheckCircle2, Circle, ArrowRight, FileCog, FileStack, Globe, Star } from 'lucide-react'
import { buildCourseWorkspacePath } from '@/lib/course-management'
import type { CourseReadinessItemId } from '@/lib/course-management'
import { useCourse } from '@components/Contexts/CourseContext'
import { Button } from '@/components/ui/button'
import AppLink from '@/components/ui/AppLink'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

export default function CourseOverview({ courseuuid }: { courseuuid: string }) {
  const t = useTranslations('DashPage.CourseManagement.Overview')
  const { readiness } = useCourse()
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

  const completedIds = new Set(checklist.filter(c => c.complete).map(c => c.id))

  const firstIncompleteTask = taskConfig.find(task => !completedIds.has(task.id as CourseReadinessItemId))

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-foreground text-sm font-semibold">{t('nextStepsHeading')}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t('nextStepsDescription')}</p>

        <div className="mt-4 flex flex-col gap-2">
          {taskConfig.map(task => {
            const complete = completedIds.has(task.id as CourseReadinessItemId)
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

      {firstIncompleteTask && (
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
