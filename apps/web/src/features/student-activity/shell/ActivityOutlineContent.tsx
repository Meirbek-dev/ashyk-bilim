'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from '@components/ui/AppLink'
import { cn } from '@/lib/utils'
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime'
import { getActivityIcon } from './activityIcons'

type RuntimeNavItem = NonNullable<StudentActivityRuntime['next']>

function cleanUuid(uuid: string | null | undefined, prefix: 'course_' | 'activity_') {
  return uuid?.replace(new RegExp(`^${prefix}`), '') ?? ''
}

interface ActivityOutlineContentProps {
  runtime: StudentActivityRuntime
  className?: string
}

/**
 * Full chapter tree used inside both the OutlineRail expanded panel and
 * the mobile Sheet drawer.
 */
export default function ActivityOutlineContent({
  runtime,
  className,
}: ActivityOutlineContentProps) {
  const t = useTranslations('ActivityPage')
  const currentId = runtime.activity?.id ?? null

  return (
    <nav aria-label={t('courseContent')} className={cn('px-2 pb-4', className)}>
      <div className="space-y-4">
        {(runtime.outline ?? []).map(chapter => {
          const activities = chapter.activities ?? []
          const completeCount = activities.filter(item => item.complete).length
          return (
            <section key={chapter.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <p className="text-muted-foreground min-w-0 truncate text-xs font-medium">
                  {chapter.index + 1}. {chapter.title}
                </p>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {completeCount}/{activities.length}
                </span>
              </div>
              <div className="space-y-0.5">
                {activities.map(item => (
                  <ActivityOutlineItem
                    key={item.id}
                    courseUuid={runtime.course.uuid}
                    current={item.id === currentId}
                    item={item}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </nav>
  )
}

function ActivityOutlineItem({
  courseUuid,
  current,
  item,
}: {
  courseUuid: string
  current: boolean
  item: RuntimeNavItem
}) {
  const href = `/course/${cleanUuid(courseUuid, 'course_')}/activity/${cleanUuid(item.uuid, 'activity_')}`
  const Icon = getActivityIcon(item.type)
  const complete = item.complete || item.state === 'complete' || item.state === 'passed'

  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      title={item.title}
      className={cn(
        'group flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        current
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        item.state === 'locked' || !item.published ? 'opacity-60' : null,
      )}
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full border',
          complete
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-background',
        )}
      >
        {complete ? <Check className="size-2.5" /> : <Icon className="size-2.5" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      {current ? <span className="bg-primary size-1.5 shrink-0 rounded-full" /> : null}
    </Link>
  )
}
