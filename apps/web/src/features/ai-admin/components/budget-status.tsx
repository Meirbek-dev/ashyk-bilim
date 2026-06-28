import { Progress } from '@/components/ui/progress'

import type { AIUsageSummary } from '../api/use-ai-usage'

export function BudgetStatus({ usage }: { usage: AIUsageSummary }) {
  const used = usage.monthly_budget - usage.remaining_budget
  const pct = usage.monthly_budget > 0 ? Math.round((used / usage.monthly_budget) * 100) : 0
  return (
    <Progress value={pct}>
      <div className="flex w-full items-center justify-between gap-3">
        <span className="text-sm font-medium">Monthly AI token budget</span>
        <span className="text-muted-foreground text-sm tabular-nums">{pct}% used</span>
      </div>
    </Progress>
  )
}
