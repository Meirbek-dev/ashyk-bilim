import type { QueryClient } from '@tanstack/react-query'

import { learnerWorkOptions } from '#/features/teach-inbox'
import { agendaOptions, dashboardOptions } from '#/shared/api/gen/@tanstack/react-query.gen'

import { DEADLINE_DAYS } from './model/agenda'

export const homeAgendaOptions = () => agendaOptions({ query: { days: DEADLINE_DAYS } })

/**
 * Route loader of /home: the agenda, the learner's open work (overdue and older returned work, which the agenda does
 * not carry) and the gamification profile `StreakBadge` reads (the same cache entry as `/achievements`).
 */
export const ensureHome = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.ensureQueryData(homeAgendaOptions()),
    queryClient.ensureInfiniteQueryData(learnerWorkOptions()),
    queryClient.ensureQueryData(dashboardOptions()),
  ])
