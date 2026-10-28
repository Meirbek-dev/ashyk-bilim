import { CalendarClock, CalendarX, Eye, ListOrdered, RotateCcw, Target, Timer } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail, AttemptState, EffectivePolicy, ReviewVisibility } from '#/shared/api/gen/types.gen'
import { formatDateTime, formatNumber, formatPercent } from '#/shared/i18n/format'

import { protections, type Protection } from '../model/attempt'

const visibility = {
  none: m.attempt_review_none,
  score_only: m.attempt_review_score_only,
  full: m.attempt_review_full,
} satisfies Record<ReviewVisibility, () => string>

const ruleLabels = {
  tab_switch: m.attempt_rule_tab_switch,
  copy_paste: m.attempt_rule_copy_paste,
  right_click: m.attempt_rule_right_click,
  fullscreen: m.attempt_rule_fullscreen,
} satisfies Record<Protection, () => string>

/**
 * The attempts line. The server counts an open draft as neither used nor remaining: while one is open the line names
 * it («Идёт попытка 1 из 3»), not «Осталось попыток: 3 из 3» for a learner already inside the only attempt.
 */
export const attemptsText = (state: AttemptState) => {
  const used = formatNumber(state.attempts_used)
  if (state.can_continue && state.draft_id) {
    const number = formatNumber(state.attempts_used + 1)
    if (state.attempts_remaining === null) return m.attempt_attempts_running_unlimited({ number })
    const total = formatNumber(state.attempts_used + state.attempts_remaining)
    return m.attempt_attempts_running({ number, total })
  }
  if (state.attempts_remaining === null)
    return state.attempts_used === 0 ? m.attempt_attempts_unlimited_fresh() : m.attempt_attempts_unlimited({ used })
  const total = formatNumber(state.attempts_used + state.attempts_remaining)
  return m.attempt_attempts_left({ left: formatNumber(state.attempts_remaining), total })
}

/**
 * What the due date means (B-ATT-02): nothing after it, a late hand-in without or with a penalty, or until a cutoff -
 * so a learner starting late knows the price before «Начать», as the file task says it.
 */
export const lateText = (
  effective: Pick<EffectivePolicy, 'allow_late' | 'due_at_unix' | 'late_policy' | 'waive_late_penalty'>,
) => {
  if (!effective.allow_late) return m.attempt_late_closed()
  const policy = effective.late_policy
  // A waived penalty waives the cutoff too: the server closes nothing for that learner (EffectivePolicy::hand_in).
  if (effective.waive_late_penalty || policy.kind === 'none') return m.attempt_late_free()
  // An own due date at or past the cutoff leaves no late window: it closes like a strict one.
  if (policy.kind === 'cutoff')
    return effective.due_at_unix !== null && policy.cutoff_at_unix <= effective.due_at_unix
      ? m.attempt_late_closed()
      : m.attempt_late_until({ date: formatDateTime(policy.cutoff_at_unix) })
  return m.attempt_late_penalty_rule({
    percent: formatPercent(policy.percent_per_day),
    days: formatNumber(policy.max_days),
  })
}

/**
 * The conditions before starting (B-ATT-02, B-ATT-04): from the effective policy of `attempt-state` only, one fact per
 * line with its icon, the passing score among them.
 */
export function PolicySummary({ assessment, state }: { assessment: AssessmentDetail; state: AttemptState }) {
  const { effective } = state
  const rules = protections(assessment.policy)
  const minutes = effective.time_limit_seconds === null ? null : Math.ceil(effective.time_limit_seconds / 60)
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{m.attempt_entry_heading()}</h2>
      <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 [&_li]:flex [&_li]:items-start [&_li]:gap-2 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
        <li>
          <ListOrdered aria-hidden />
          {m.attempt_questions({ count: formatNumber(assessment.items.length) })}
        </li>
        <li>
          <Timer aria-hidden />
          {minutes === null ? m.attempt_no_time_limit() : m.attempt_time_limit({ minutes: formatNumber(minutes) })}
        </li>
        <li>
          <RotateCcw aria-hidden />
          {attemptsText(state)}
        </li>
        <li>
          <Target aria-hidden />
          {m.attempt_passing_score({ score: formatPercent(effective.passing_score) })}
        </li>
        {effective.due_at_unix ? (
          <li>
            <CalendarClock aria-hidden />
            {m.attempt_due({ date: formatDateTime(effective.due_at_unix) })}
          </li>
        ) : null}
        {effective.due_at_unix ? (
          <li>
            <CalendarX aria-hidden />
            {lateText(effective)}
          </li>
        ) : null}
        <li>
          <Eye aria-hidden />
          {visibility[assessment.policy.review_visibility]()}
        </li>
      </ul>
      {rules.length ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">{m.attempt_rules_heading()}</h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {rules.map(rule => (
              <li key={rule}>{ruleLabels[rule]()}</li>
            ))}
            <li>{m.attempt_rule_threshold({ count: formatNumber(assessment.policy.violation_threshold) })}</li>
          </ul>
        </div>
      ) : null}
    </section>
  )
}
