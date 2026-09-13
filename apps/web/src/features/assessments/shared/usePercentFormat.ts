import { useFormatter } from 'next-intl'

/**
 * The one percent format on learner surfaces (attempt history, result card,
 * file result, toasts): locale digits, at most two decimals — «31,58%» in ru,
 * never «31.58%» beside «32%» (UX-035).
 */
export function usePercentFormat(): (percent: number) => string {
  const format = useFormatter()
  return percent => `${format.number(percent, { maximumFractionDigits: 2 })}%`
}
