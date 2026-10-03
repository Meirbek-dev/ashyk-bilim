import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'

import { StreakBadge } from '#/features/achievements'
import { learnerWorkOptions } from '#/features/teach-inbox'
import { m } from '#/paraglide/messages'
import { ListState } from '#/shared/components/list-state'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { buttonVariants } from '#/shared/ui/button'

import { attentionWork, isEmptyToday } from '../model/agenda'
import { homeAgendaOptions } from '../queries'
import { AttentionSection } from './attention-section'
import { ContinueSection } from './continue-section'
import { DeadlinesSection } from './deadlines-section'
import { ResultsSection } from './results-section'
import { UpdatesSection } from './updates-section'

/** /home "Today": what to do now, from the agenda; the learner's queue adds only what the agenda lacks. */
export function HomePage() {
  const agenda = useSuspenseQuery(homeAgendaOptions())
  const work = useSuspenseInfiniteQuery(learnerWorkOptions())
  const { continue_learning, deadlines, recent_results, course_updates } = agenda.data
  // The loaded first page is enough: the server sorts the queue by priority, overdue and returned work first.
  const attention = attentionWork(
    work.data.pages.flatMap(page => page.items),
    recent_results,
  )
  const empty = isEmptyToday(agenda.data, attention)
  return (
    <DetailPage title={m.home_title()}>
      <div className="flex flex-col gap-8">
        <StreakBadge />
        <ListState
          pending={false}
          error={agenda.error}
          count={empty ? 0 : 1}
          filtered={false}
          emptyText={m.home_empty()}
          emptyAction={
            <RouterLink to="/courses" className={buttonVariants()}>
              {m.home_find_course()}
            </RouterLink>
          }
          onRetry={() => void agenda.refetch()}
        >
          <ContinueSection items={continue_learning} />
          <AttentionSection items={attention} />
          <DeadlinesSection deadlines={deadlines} nowUnix={Math.floor(agenda.dataUpdatedAt / 1000)} />
          <ResultsSection results={recent_results} />
          <UpdatesSection updates={course_updates} />
        </ListState>
      </div>
    </DetailPage>
  )
}
