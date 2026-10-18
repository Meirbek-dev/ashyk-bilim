import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { formatNumber, formatPercent } from '#/shared/i18n/format'
import { KpiStrip } from '#/shared/components/charts/kpi-strip'
import { KpiTile } from '#/shared/components/charts/kpi-tile'
import { Progress } from '#/shared/components/progress'

import { budgetUsed } from '../model/ai'
import { usageSummaryOptions } from '../queries'

/** Runs and tokens of the month against the monthly budget (B-AI-20). */
export function AdminUsage() {
  const { data: usage } = useSuspenseQuery(usageSummaryOptions())
  const used = budgetUsed(usage.monthly_budget, usage.remaining_budget)
  return (
    <section id="usage" className="flex max-w-prose flex-col gap-4">
      <h2 className="text-xl font-semibold">{m.ai_admin_usage()}</h2>
      <KpiStrip columns={3}>
        <KpiTile label={m.ai_usage_runs_label()} value={formatNumber(usage.total_runs)} />
        <KpiTile label={m.ai_usage_input_label()} value={formatNumber(usage.input_tokens)} />
        <KpiTile label={m.ai_usage_output_label()} value={formatNumber(usage.output_tokens)} />
      </KpiStrip>
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
