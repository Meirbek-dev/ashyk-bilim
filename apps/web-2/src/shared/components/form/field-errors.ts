import type { FieldError } from '#/shared/api/gen/types.gen'
import { serverFieldMessage } from '#/shared/i18n/validation'

/** The first error of a field as text: Valibot issues carry `message`, server errors are strings. */
export function errorText(errors: readonly unknown[]): string | undefined {
  for (const error of errors) {
    if (typeof error === 'string') return error
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string')
      return error.message
  }
  return undefined
}

/**
 * A 422's `field_errors` split by the form's field names: one text per field (the first wins), and the
 * errors no field on this form can show (they go to the form's region alert).
 */
export function splitFieldErrors(errors: readonly FieldError[], fields: readonly string[]) {
  const byField = new Map<string, string>()
  const rest: FieldError[] = []
  for (const error of errors) {
    if (!fields.includes(error.field)) rest.push(error)
    else if (!byField.has(error.field)) byField.set(error.field, serverFieldMessage(error.code))
  }
  return { byField, rest }
}
