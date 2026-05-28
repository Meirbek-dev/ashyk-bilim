'use client'

import { useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Focus,
  ListTree,
  PanelLeftClose,
  Sparkles,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import Link from '@components/ui/AppLink'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime'
import { useActivityLayout } from '@/features/assessments/shell/ActivityLayoutContext'
import ActivityOutlineContent from './ActivityOutlineContent'

type RuntimeNavItem = NonNullable<StudentActivityRuntime['next']>

function cleanUuid(uuid: string | null | undefined, prefix: 'course_' | 'activity_') {
  return uuid?.replace(new RegExp(`^${prefix}`), '') ?? ''
}

export interface ActivityHeaderProps {
  runtime: StudentActivityRuntime
  focusMode: boolean
  onToggleFocusMode: () => void
  onToggleOutline: () => void
  outlineOpen: boolean
  onToggleAi: () => void
  aiOpen: boolean
}

export default function ActivityHeader({
  runtime,
  focusMode,
  onToggleFocusMode,
  onToggleOutline,
  outlineOpen,
  onToggleAi,
  aiOpen,
}: ActivityHeaderProps) {
  const t = useTranslations('ActivityPage')
  const tBreadcrumb = useTranslations('Components.Breadcrumb')
  const { mode } = useActivityLayout()
  const isAttemptActive = mode === 'ACTIVE_ATTEMPT'

  const position = useMemo(() => {
    if (!runtime.activity) return null
    const items = (runtime.outline ?? []).flatMap(chapter => chapter.activities ?? [])
    const index = items.findIndex(item => item.id === runtime.activity?.id)
    return { current: index !== -1 ? index + 1 : 1, total: items.length || 1 }
  }, [runtime.activity, runtime.outline])

  const percent = useMemo(() => {
    const items = (runtime.outline ?? []).flatMap(chapter => chapter.activities ?? [])
    if (items.length === 0) return 0

    const done = items.filter(
      item => item.complete || item.state === 'complete' || item.state === 'passed',
    ).length
    return Math.round((done / items.length) * 100)
  }, [runtime.outline])

  const courseHref = `/course/${cleanUuid(runtime.course.uuid, 'course_')}`

  if (focusMode) {
    return (
      <FocusHeader
        runtime={runtime}
        position={position}
        percent={percent}
        onExit={onToggleFocusMode}
      />
    )
  }

  return (
    <header className="border-border/70 bg-background/95 sticky top-14 z-30 border-b backdrop-blur">
      <div className="relative flex h-11 items-center gap-2 px-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {!isAttemptActive ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleOutline}
                aria-label={t('courseContent')}
                className="hidden shrink-0 lg:flex"
              >
                {outlineOpen ? (
                  <PanelLeftClose className="size-4" />
                ) : (
                  <ListTree className="size-4" />
                )}
              </Button>

              <MobileOutlineSheet runtime={runtime} />
            </>
          ) : null}

          <nav
            aria-label={tBreadcrumb('ariaLabel')}
            className="flex min-w-0 items-center gap-1 text-xs"
          >
            <Link
              href={courseHref}
              className="text-muted-foreground hover:text-foreground max-w-[8rem] min-w-0 truncate"
            >
              {runtime.course.title}
            </Link>
            {runtime.activity?.chapter_title ? (
              <>
                <span className="text-muted-foreground shrink-0">/</span>
                <span className="text-muted-foreground max-w-[8rem] min-w-0 truncate">
                  {runtime.activity.chapter_title}
                </span>
              </>
            ) : null}
            <span className="text-muted-foreground shrink-0">/</span>
            <span className="text-foreground max-w-xs min-w-0 truncate font-medium">
              {runtime.activity?.title ?? runtime.course.title}
            </span>
          </nav>
        </div>

        {!isAttemptActive ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {position ? (
              <span className="text-muted-foreground hidden text-xs tabular-nums sm:block">
                {t('activityCounter', {
                  current: position.current,
                  total: position.total,
                })}
              </span>
            ) : null}
            <Button
              type="button"
              variant={aiOpen ? 'default' : 'ghost'}
              size="icon"
              onClick={onToggleAi}
              aria-label={t('aiAssistant')}
              title={t('aiAssistant')}
            >
              <Sparkles className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onToggleFocusMode}
              aria-label={t('focusMode')}
              title={t('focusMode')}
            >
              <Focus className="size-4" />
            </Button>
          </div>
        ) : null}

        {!isAttemptActive ? <ProgressFill percent={percent} /> : null}
      </div>
    </header>
  )
}

function FocusHeader({
  runtime,
  position,
  percent,
  onExit,
}: {
  runtime: StudentActivityRuntime
  position: { current: number; total: number } | null
  percent: number
  onExit: () => void
}) {
  const t = useTranslations('ActivityPage')
  const subtitle = runtime.activity?.chapter_title
    ? `${runtime.course.title} / ${runtime.activity.chapter_title}`
    : runtime.course.title

  return (
    <header className="border-border/70 bg-background/95 sticky top-0 z-50 border-b backdrop-blur">
      <div className="relative mx-auto flex h-12 max-w-[96rem] items-center gap-2 px-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-md">
            <Focus className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {runtime.activity?.title ?? runtime.course.title}
            </p>
            <p className="text-muted-foreground hidden truncate text-xs sm:block">{subtitle}</p>
          </div>
        </div>

        {position ? (
          <span className="text-muted-foreground hidden shrink-0 text-xs tabular-nums md:block">
            {t('activityCounter', {
              current: position.current,
              total: position.total,
            })}
          </span>
        ) : null}

        <div className="flex shrink-0 items-center gap-1">
          <FocusNavButton
            item={runtime.previous ?? null}
            courseUuid={runtime.course.uuid}
            side="prev"
          />
          <FocusNavButton
            item={runtime.next ?? null}
            courseUuid={runtime.course.uuid}
            side="next"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onExit}
            aria-label={t('exitFocusMode')}
            title={t('exitFocusMode')}
          >
            <X className="size-4" />
            <span className="hidden sm:inline">{t('exitFocusMode')}</span>
          </Button>
        </div>

        <ProgressFill percent={percent} />
      </div>
    </header>
  )
}

function FocusNavButton({
  courseUuid,
  item,
  side,
}: {
  courseUuid: string
  item: RuntimeNavItem | null
  side: 'prev' | 'next'
}) {
  const t = useTranslations('ActivityPage')
  const label = side === 'prev' ? t('previous') : t('next')
  const Icon = side === 'prev' ? ChevronLeft : ChevronRight

  if (!item) {
    return (
      <Button type="button" variant="ghost" size="icon" disabled aria-label={label}>
        <Icon className="size-4" />
      </Button>
    )
  }

  const href = `/course/${cleanUuid(courseUuid, 'course_')}/activity/${cleanUuid(item.uuid, 'activity_')}`

  return (
    <Button
      variant="ghost"
      size="icon"
      nativeButton={false}
      render={<Link href={href} />}
      aria-label={label}
      title={item.title}
    >
      <Icon className="size-4" />
    </Button>
  )
}

function ProgressFill({ percent }: { percent: number }) {
  return (
    <div className="bg-border/50 absolute inset-x-0 bottom-0 h-[3px]" aria-hidden>
      <div
        className="bg-primary h-full transition-[width] duration-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

function MobileOutlineSheet({ runtime }: { runtime: StudentActivityRuntime }) {
  const t = useTranslations('ActivityPage')

  return (
    <Sheet>
      <SheetTrigger
        render={(triggerProps: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            aria-label={t('courseContent')}
            {...triggerProps}
          >
            <ListTree className="size-4" />
          </Button>
        )}
      />
      <SheetContent side="left" className="w-[min(92vw,22rem)] p-0">
        <SheetHeader className="px-4 pt-4">
          <SheetTitle>{t('courseContent')}</SheetTitle>
        </SheetHeader>
        <ActivityOutlineContent runtime={runtime} className="mt-2 flex-1 overflow-y-auto" />
      </SheetContent>
    </Sheet>
  )
}
