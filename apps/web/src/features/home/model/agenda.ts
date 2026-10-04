import type { Agenda, AgendaDeadline, RecentResult, WorkItem } from '#/shared/api/gen/types.gen'
import { toDateTimeInput } from '#/shared/i18n/format'

/** The deadline window of /home (spec 5.4: 14 days). */
export const DEADLINE_DAYS = 14

/** The platform-zone calendar day of an instant, e.g. "2026-10-03". */
const dayOf = (unix: number) => toDateTimeInput(unix).slice(0, 10)

/** The platform-zone time of day of an instant, e.g. "23:59". */
export const timeOf = (unix: number) => toDateTimeInput(unix).slice(11)

type DayName = 'today' | 'tomorrow' | 'later'
export type DeadlineDay = { day: string; name: DayName; dueUnix: number; deadlines: AgendaDeadline[] }

/** Deadlines by platform day, soonest first; the platform zone has no DST, so tomorrow is now + 24 h. */
export function groupDeadlines(deadlines: readonly AgendaDeadline[], nowUnix: number): DeadlineDay[] {
  const today = dayOf(nowUnix)
  const tomorrow = dayOf(nowUnix + 86_400)
  const days = new Map<string, DeadlineDay>()
  for (const deadline of deadlines.toSorted((a, b) => a.due_at_unix - b.due_at_unix)) {
    const day = dayOf(deadline.due_at_unix)
    const name: DayName = day === today ? 'today' : day === tomorrow ? 'tomorrow' : 'later'
    const group = days.get(day) ?? { day, name, dueUnix: deadline.due_at_unix, deadlines: [] }
    group.deadlines.push(deadline)
    days.set(day, group)
  }
  return [...days.values()]
}

/** The learner `kind`s of `GET /work` that /home shows (the plain string of `WorkItem.kind`). */
export type AttentionKind = 'overdue' | 'returned_for_revision'

const isAttention = (item: WorkItem): item is WorkItem & { kind: AttentionKind } =>
  item.kind === 'overdue' || item.kind === 'returned_for_revision'

/**
 * Work the agenda does not carry: overdue tasks (its deadline window starts now) and returned work older than its
 * 14 days of results. Returned work that is among the results is shown there, not twice.
 */
export function attentionWork(items: readonly WorkItem[], results: readonly RecentResult[]) {
  const inResults = new Set(results.map(result => result.activity_id))
  return items.filter(isAttention).filter(item => item.kind === 'overdue' || !inResults.has(item.activity_id))
}

/** Nothing at all to show: no course in progress, deadline, result, announcement or open work. */
export const isEmptyToday = (agenda: Agenda, attention: readonly WorkItem[]) =>
  attention.length === 0 &&
  agenda.continue_learning.length === 0 &&
  agenda.deadlines.length === 0 &&
  agenda.recent_results.length === 0 &&
  agenda.course_updates.length === 0
