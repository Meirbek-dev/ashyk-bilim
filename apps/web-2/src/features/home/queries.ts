import type { QueryClient } from '@tanstack/react-query'

import { landingCoursesOptions } from '#/features/catalog'
import { learnerWorkOptions } from '#/features/teach-inbox'
import { agendaOptions, dashboardOptions, listEnrollmentsOptions } from '#/shared/api/gen/@tanstack/react-query.gen'

import { DEADLINE_DAYS } from './model/agenda'

export const homeAgendaOptions = () => agendaOptions({ query: { days: DEADLINE_DAYS } })

/** One course of the learner's, if any: with nothing to continue, it tells "all done" from "new here" (B-HOME-10). */
export const anyEnrollmentOptions = () => listEnrollmentsOptions({ query: { limit: 1 } })

/**
 * Route loader of /home: the agenda, the learner's open work (overdue and older returned work, which the agenda does
 * not carry) and the gamification profile `StreakBadge` reads (the same cache entry as `/achievements`). With no
 * course to continue, also the newest courses the empty page suggests (B-HOME-09) and whether the learner has any
 * course at all (B-HOME-10).
 */
export async function ensureHome(queryClient: QueryClient) {
  const [agenda] = await Promise.all([
    queryClient.query({ ...homeAgendaOptions(), staleTime: 'static' }),
    queryClient.infiniteQuery({ ...learnerWorkOptions(), staleTime: 'static' }),
    queryClient.query({ ...dashboardOptions(), staleTime: 'static' }),
  ])
  if (agenda.continue_learning.length === 0)
    await Promise.all([
      queryClient.query({ ...landingCoursesOptions(), staleTime: 'static' }),
      queryClient.query({ ...anyEnrollmentOptions(), staleTime: 'static' }),
    ])
}
