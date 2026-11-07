import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { formatNumber, formatPercent } from '#/shared/i18n/format'
import { Progress } from '#/shared/components/progress'

import { budgetUsed } from '../model/ai'
import { usageSummaryOptions } from '../queries'
import { AdminNumbers } from './admin-numbers'

/** Runs and tokens of the month against the monthly budget (B-AI-20). */
export function AdminUsage() {
  const { data: usage } = useSuspenseQuery(usageSummaryOptions())
  const used = budgetUsed(usage.monthly_budget, usage.remaining_budget)
  return (
    <section id="usage" className="flex max-w-prose flex-col gap-4">
      <h2 className="text-xl font-semibold">{m.ai_admin_usage()}</h2>
      {/* What the budget still allows comes first; the month's counts under it. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm tabular-nums">
            {m.ai_budget({ left: formatNumber(usage.remaining_budget), total: formatNumber(usage.monthly_budget) })}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {m.ai_budget_used()} {formatPercent(used)}
          </p>
        </div>
        <Progress value={used} aria-label={m.ai_budget_used()} />
      </div>
      <AdminNumbers
        columns={3}
        items={[
          { key: 'runs', label: m.ai_usage_runs_label(), value: formatNumber(usage.total_runs) },
          { key: 'input', label: m.ai_usage_input_label(), value: formatNumber(usage.input_tokens) },
          { key: 'output', label: m.ai_usage_output_label(), value: formatNumber(usage.output_tokens) },
        ]}
      />
    </section>
  )
}
