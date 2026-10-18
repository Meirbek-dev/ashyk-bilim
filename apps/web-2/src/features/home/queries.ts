import type { QueryClient } from '@tanstack/react-query'

import { landingCoursesOptions } from '#/features/catalog'
import { learnerWorkOptions } from '#/features/teach-inbox'
import { agendaOptions, dashboardOptions } from '#/shared/api/gen/@tanstack/react-query.gen'

import { DEADLINE_DAYS } from './model/agenda'

export const homeAgendaOptions = () => agendaOptions({ query: { days: DEADLINE_DAYS } })

/**
 * Route loader of /home: the agenda, the learner's open work (overdue and older returned work, which the agenda does
 * not carry) and the gamification profile `StreakBadge` reads (the same cache entry as `/achievements`). With no
 * course to continue, also the newest courses the empty page suggests (B-HOME-09).
 */
export async function ensureHome(queryClient: QueryClient) {
  const [agenda] = await Promise.all([
    queryClient.query({ ...homeAgendaOptions(), staleTime: 'static' }),
    queryClient.infiniteQuery({ ...learnerWorkOptions(), staleTime: 'static' }),
    queryClient.query({ ...dashboardOptions(), staleTime: 'static' }),
  ])
  if (agenda.continue_learning.length === 0)
    await queryClient.query({ ...landingCoursesOptions(), staleTime: 'static' })
}
