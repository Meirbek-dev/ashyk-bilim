import { isApiError } from '@/lib/api/assertSuccess'

type Translator = ((key: string, values?: Record<string, string | number>) => string) & {
  has: (key: string) => boolean
}

/**
 * Localized sentence for a failed analytics load. Analytics-specific buckets
 * first (403 = filters point outside the caller's scope, 422 = bad filters),
 * then `Errors.codes.<code>`; never the server's English `detail`, and
 * `fallback` for anything without a translated contract code.
 */
export function describeAnalyticsError(
  error: unknown,
  t: Translator, // TeacherAnalytics
  tErrors: Translator, // Errors
  fallback: string,
): string {
  if (!isApiError(error)) return fallback
  if (error.status === 403) {
    // `details.filter` names the filter the server refused (teacher_user_id without platform scope).
    return error.details?.filter === 'teacher_user_id' ? t('pages.teacherFilterDenied') : t('pages.scopeDenied')
  }
  if (error.status === 422) {
    // UX-148: `field_errors[].field` names the filter; an unknown teacher id gets its own copy.
    return error.fieldErrors.some(f => f.field === 'teacher_user_id') ? t('pages.teacherFilterUnknown') : t('pages.invalidFilters')
  }
  const key = `codes.${error.code}`
  return tErrors.has(key) ? tErrors(key) : fallback
}
