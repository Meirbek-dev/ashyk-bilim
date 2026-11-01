import { m } from '#/paraglide/messages'
import type { CaseResult } from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'

import { caseVerdict } from '../model/verdict'

const ms = (seconds: number | null) => formatNumber(Math.round((seconds ?? 0) * 1000))
const mb = (kb: number | null) => formatNumber(Math.round((kb ?? 0) / 102.4) / 10)

/** A test's time and memory; a killed run's numbers are the sandbox's last sample («4 мс» on a time limit): none. */
export function Usage({ result }: { result: CaseResult }) {
  if (caseVerdict(result) === 'time_limit' || (result.time_seconds === null && result.memory_kb === null)) return null
  return (
    <span className="text-sm text-muted-foreground tabular-nums">
      {m.code_case_usage({ ms: ms(result.time_seconds), mb: mb(result.memory_kb) })}
    </span>
  )
}
