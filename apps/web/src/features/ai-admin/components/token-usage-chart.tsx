import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import type { AIUsageSummary } from '../api/use-ai-usage'

export function TokenUsageChart({ usage }: { usage: AIUsageSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI usage</CardTitle>
        <CardDescription>Token usage across AI runs.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <Metric label="Runs" value={usage.total_runs.toLocaleString()} />
        <Metric label="Input tokens" value={usage.input_tokens.toLocaleString()} />
        <Metric label="Output tokens" value={usage.output_tokens.toLocaleString()} />
      </CardContent>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
