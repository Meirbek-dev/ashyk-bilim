import { m } from '#/paraglide/messages'
import type { AgendaDeadline } from '#/shared/api/gen/types.gen'
import { DataList } from '#/shared/components/data-list'
import { formatDate } from '#/shared/i18n/format'

import { groupDeadlines, type DeadlineDay } from '../model/agenda'
import { DeadlineItem } from './deadline-item'
import { HomeSection } from './home-section'

const dayTitle = (day: DeadlineDay) => {
  if (day.name === 'today') return m.home_day_today()
  if (day.name === 'tomorrow') return m.home_day_tomorrow()
  return formatDate(day.dueUnix)
}

/** Deadlines of the next 14 days by platform day; always shown, with one sentence when there are none. */
export function DeadlinesSection({ deadlines, nowUnix }: { deadlines: readonly AgendaDeadline[]; nowUnix: number }) {
  const days = groupDeadlines(deadlines, nowUnix)
  return (
    <HomeSection title={m.home_deadlines_title()}>
      {days.length === 0 ? <p className="text-muted-foreground">{m.home_deadlines_empty()}</p> : null}
      {days.map(day => (
        <div key={day.day} className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">{dayTitle(day)}</p>
          <DataList items={day.deadlines} getKey={deadline => deadline.activity_id}>
            {deadline => <DeadlineItem deadline={deadline} />}
          </DataList>
        </div>
      ))}
    </HomeSection>
  )
}
