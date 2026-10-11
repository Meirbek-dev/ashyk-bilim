import { CalendarClock } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'

import AppLink from '@/components/ui/AppLink'
import { Button } from '@/components/ui/button'
import { fromUnix } from '@/lib/api/contract'
import { DATE_TIME_LONG_OPTIONS, formatDate } from '@/lib/date'
import type { ScheduledActivity as ScheduledEntry } from '@/features/learner-course/api'

/** A direct link to a test that is scheduled to open: when it opens, instead of «Активность не найдена» (ROUND3-11). */
export default async function ScheduledActivity({
  activity,
  courseuuid,
}: {
  activity: ScheduledEntry
  courseuuid: string
}) {
  const [tErrors, locale] = await Promise.all([getTranslations('Errors'), getLocale()])
  const date =
    activity.opensAtUnix === null ? '' : formatDate(fromUnix(activity.opensAtUnix), locale, DATE_TIME_LONG_OPTIONS)
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="bg-card border-border/80 w-full max-w-md rounded-xl border p-8 shadow-md">
        <div className="bg-muted/60 text-muted-foreground/80 mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full">
          <CalendarClock className="h-8 w-8 stroke-[1.5]" />
        </div>
        <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
          {tErrors('activityScheduled')}
        </p>
        <h1 className="text-foreground mb-2 text-xl font-semibold tracking-tight wrap-anywhere">{activity.title}</h1>
        <p className="text-muted-foreground mb-8 text-sm leading-relaxed" data-testid="scheduled-opens">
          {tErrors('activityScheduledMessage', { date })}
        </p>
        <Button nativeButton={false} render={<AppLink href={`/course/${courseuuid}`} />}>
          {tErrors('backToCourse')}
        </Button>
      </div>
    </div>
  )
}
