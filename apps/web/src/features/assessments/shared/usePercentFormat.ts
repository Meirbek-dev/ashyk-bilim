import { useMemo } from 'react'
import { useFormatter } from 'next-intl'

type NumberFormatter = Pick<ReturnType<typeof useFormatter>, 'number'>

/** `formatPercent(await getFormatter(), v)` for server components (UX-114). */
export const formatPercent = (format: NumberFormatter, percent: number) =>
  `${format.number(percent, { maximumFractionDigits: 2 })}%`

/**
 * The one percent format on learner and analytics surfaces (attempt history,
 * result card, file result, toasts, analytics tables): locale digits, at most
 * two decimals — «31,58%» in ru, never «31.58%» beside «32%» (UX-035).
 */
export function usePercentFormat(): (percent: number) => string {
  const format = useFormatter()
  // Stable per locale, so memoized column definitions can depend on it.
  return useMemo(() => (percent: number) => formatPercent(format, percent), [format])
}
