import { fromDateTimeInput } from '#/shared/i18n/format'

/** A `datetime-local` value as unix seconds in the platform zone; null when blank or malformed. */
export function momentOf(value: string): number | null {
  if (!value) return null
  const at = fromDateTimeInput(value)
  return Number.isFinite(at) ? at : null
}
