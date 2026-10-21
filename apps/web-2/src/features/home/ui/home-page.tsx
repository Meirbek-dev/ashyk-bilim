import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'

import { StreakBadge, useLoginStreak } from '#/features/achievements'
import { learnerWorkOptions } from '#/features/teach-inbox'
import { m } from '#/paraglide/messages'
import { ListState } from '#/shared/components/list-state'

import { attentionWork, isEmptyToday } from '../model/agenda'
import { homeAgendaOptions } from '../queries'
import { AttentionSection } from './attention-section'
import { ContinueSection } from './continue-section'
import { DeadlinesSection } from './deadlines-section'
import { HomeWelcome } from './home-welcome'
import { ResultsSection } from './results-section'
import { UpdatesSection } from './updates-section'

/** /home "Today": what to do now, from the agenda; the learner's queue adds only what the agenda lacks. */
export function HomePage() {
  useLoginStreak()
  const agenda = useSuspenseQuery(homeAgendaOptions())
  const work = useSuspenseInfiniteQuery(learnerWorkOptions())
  const { continue_learning, deadlines, recent_results, course_updates } = agenda.data
  // The loaded first page is enough: the server sorts the queue by priority, overdue and returned work first.
  const attention = attentionWork(
    work.data.pages.flatMap(page => page.items),
    recent_results,
  )
  const empty = isEmptyToday(agenda.data, attention)
  // Results and announcements make a side column from @4xl; without either the page stays one column.
  const side = recent_results.length > 0 || course_updates.length > 0
  return (
    <section className="@container flex flex-col gap-10">
      <header className="flex flex-col gap-4 @2xl:flex-row @2xl:items-end @2xl:justify-between">
        <h1 className="text-display font-semibold">{m.home_title()}</h1>
        <StreakBadge />
      </header>
      <div className="flex flex-col gap-12">
        <ListState
          pending={false}
          error={agenda.error}
          count={1}
          filtered={false}
          emptyText={m.home_empty()}
          onRetry={() => void agenda.refetch()}
        >
          {/* An empty Today is not one sentence: who is new and who has finished everything read differently. */}
          {empty ? (
            <HomeWelcome />
          ) : (
            <>
              <ContinueSection items={continue_learning} />
              <div className={side ? 'grid gap-12 @4xl:grid-cols-5 @4xl:gap-8' : 'flex flex-col gap-12'}>
                <div className="flex flex-col gap-12 @4xl:col-span-3">
                  <AttentionSection items={attention} />
                  <DeadlinesSection deadlines={deadlines} nowUnix={Math.floor(agenda.dataUpdatedAt / 1000)} />
                </div>
                {side ? (
                  <div className="flex flex-col gap-12 @4xl:col-span-2">
                    <ResultsSection results={recent_results} />
                    <UpdatesSection updates={course_updates} />
                  </div>
                ) : null}
              </div>
            </>
          )}
        </ListState>
      </div>
    </section>
  )
}
