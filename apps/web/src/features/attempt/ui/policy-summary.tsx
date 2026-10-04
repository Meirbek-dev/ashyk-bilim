import { m } from '#/paraglide/messages'
import type { AssessmentDetail, AttemptState, ReviewVisibility } from '#/shared/api/gen/types.gen'
import { formatDate, formatNumber } from '#/shared/i18n/format'

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

/** The conditions before starting (B-ATT-02, B-ATT-04): from the effective policy of `attempt-state` only. */
export function PolicySummary({ assessment, state }: { assessment: AssessmentDetail; state: AttemptState }) {
  const { effective } = state
  const rules = protections(assessment.policy)
  const minutes = effective.time_limit_seconds === null ? null : Math.ceil(effective.time_limit_seconds / 60)
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{m.attempt_entry_heading()}</h2>
      <ul className="flex flex-col gap-1 text-sm">
        <li>{m.attempt_questions({ count: formatNumber(assessment.items.length) })}</li>
        <li>
          {minutes === null ? m.attempt_no_time_limit() : m.attempt_time_limit({ minutes: formatNumber(minutes) })}
        </li>
        <li>
          {state.attempts_remaining === null
            ? m.attempt_attempts_unlimited({ used: formatNumber(state.attempts_used) })
            : m.attempt_attempts_left({
                used: formatNumber(state.attempts_used),
                left: formatNumber(state.attempts_remaining),
              })}
        </li>
        {effective.due_at_unix ? <li>{m.attempt_due({ date: formatDate(effective.due_at_unix) })}</li> : null}
        <li>{visibility[assessment.policy.review_visibility]()}</li>
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
