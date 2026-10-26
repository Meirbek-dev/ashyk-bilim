import type * as v from 'valibot'

import { m } from '#/paraglide/messages'

// Spec 7.8: field constraints come from the contract; their texts come from this one map.

type Issue = v.BaseIssue<unknown>

const requirement = (issue: Issue): string => {
  const value = issue.requirement
  return typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string' ? String(value) : ''
}

/** Valibot issue -> Paraglide text, read at validation time so it follows the current locale. */
export function validationMessage(issue: Issue): string {
  // Whatever rule a blank field breaks (a pattern, a custom check: a new role's identifier), it reads "fill it in", as
  // every other required field does; «Проверьте это значение.» under an empty field was a riddle.
  // A check forwarded to a field (`v.forward`) carries the whole form as its input: the field's value is on its path.
  const value = issue.path?.at(-1)?.value ?? issue.input
  if (value === '' && issue.type !== 'max_length') return m.validation_required()
  switch (issue.type) {
    case 'min_length':
    case 'non_empty':
      // An empty field is "fill it in", whatever its minimum: «Минимум символов: 3» under a blank username misleads.
      return issue.requirement === 1 || issue.type === 'non_empty'
        ? m.validation_required()
        : m.validation_min_length({ min: requirement(issue) })
    case 'max_length':
      return m.validation_max_length({ max: requirement(issue) })
    case 'min_value':
      return m.validation_min_value({ min: requirement(issue) })
    case 'max_value':
      return m.validation_max_value({ max: requirement(issue) })
    case 'integer':
      return m.validation_integer()
    case 'email':
      return m.validation_email()
    case 'url':
    case 'uuid':
    case 'regex':
      return m.validation_format()
    default:
      return m.validation_invalid()
  }
}

// `field_errors[].code` of a 422 (server: FieldError::code). Codes without a text here read as "invalid".
const serverCodes: Partial<Record<string, () => string>> = {
  required: m.validation_required,
  duplicate: m.validation_duplicate,
  'too-long': m.validation_too_long,
  'out-of-range': m.validation_out_of_range,
  range: m.validation_out_of_range,
  // A document's link or embed (REVIEW-1 C1); `unsafe`: a link preview of a private or local address.
  'unsafe-url': m.validation_unsafe_url,
  unsafe: m.validation_unsafe_url,
}

/**
 * A field's server error as text. An `invalid` email (empty or without @) says what an address looks like; an `invalid`
 * `code` (every request with one takes a code from an email or an authenticator app) is wrong or expired.
 */
export const serverFieldMessage = (code: string, field = ''): string => {
  if (code === 'invalid' && /(^|[._])email$/.test(field)) return m.validation_email()
  if (code === 'invalid' && field === 'code') return m.validation_code_wrong()
  return (serverCodes[code] ?? m.validation_invalid)()
}
