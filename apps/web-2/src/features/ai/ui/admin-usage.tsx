import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { formatNumber, formatPercent } from '#/shared/i18n/format'
import { Progress } from '#/shared/ui/progress'

import { budgetUsed } from '../model/ai'
import { usageSummaryOptions } from '../queries'

/** Runs and tokens of the month against the monthly budget (B-AI-20). */
export function AdminUsage() {
  const { data: usage } = useSuspenseQuery(usageSummaryOptions())
  const used = budgetUsed(usage.monthly_budget, usage.remaining_budget)
  return (
    <section id="usage" className="flex max-w-prose flex-col gap-4">
      <h2 className="text-xl font-semibold">{m.ai_admin_usage()}</h2>
      <ul className="flex flex-col gap-1 text-sm">
        <li>{m.ai_usage_runs({ count: formatNumber(usage.total_runs) })}</li>
        <li>{m.ai_usage_input({ count: formatNumber(usage.input_tokens) })}</li>
        <li>{m.ai_usage_output({ count: formatNumber(usage.output_tokens) })}</li>
      </ul>
      <div className="flex flex-col gap-2">
        <p className="text-sm">
          {m.ai_budget({ left: formatNumber(usage.remaining_budget), total: formatNumber(usage.monthly_budget) })}
        </p>
        <Progress value={used} aria-label={m.ai_budget_used()} />
        <p className="text-xs text-muted-foreground">
          {m.ai_budget_used()} {formatPercent(used)}
        </p>
      </div>
    </section>
  )
}
