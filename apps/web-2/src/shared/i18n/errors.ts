import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { ErrorCode } from '#/shared/api/gen/types.gen'

// One text per API error code (spec 7.11). Exhaustive: a new code in the contract fails the type check here.
const messages: Record<ErrorCode, () => string> = {
  internal: m.errors_internal,
  'not-found': m.errors_not_found,
  'method-not-allowed': m.errors_method_not_allowed,
  forbidden: m.errors_forbidden,
  unauthenticated: m.errors_unauthenticated,
  conflict: m.errors_conflict,
  'idempotency-in-progress': m.errors_idempotency_in_progress,
  'validation-failed': m.errors_validation_failed,
  'precondition-failed': m.errors_precondition_failed,
  'rate-limited': m.errors_rate_limited,
  'payload-too-large': m.errors_payload_too_large,
  'activity-not-ready': m.errors_activity_not_ready,
  'course-not-ready': m.errors_course_not_ready,
  'course-archived': m.errors_course_archived,
  'unsupported-media-type': m.errors_unsupported_media_type,
  'service-unavailable': m.errors_service_unavailable,
  'invalid-credentials': m.errors_invalid_credentials,
  'mfa-required': m.errors_mfa_required,
  'session-expired': m.errors_session_expired,
  'csrf-rejected': m.errors_csrf_rejected,
  'account-disabled': m.errors_account_disabled,
  'google-oauth-expired': m.errors_google_oauth_expired,
  'account-exists': m.errors_account_exists,
  'invalid-totp-code': m.errors_invalid_totp_code,
  'username-taken': m.errors_username_taken,
  'email-taken': m.errors_email_taken,
  'role-slug-taken': m.errors_role_slug_taken,
  'last-admin': m.errors_last_admin,
  'self-disable': m.errors_self_disable,
  'link-preview-failed': m.errors_link_preview_failed,
  'code-runner-degraded': m.errors_code_runner_degraded,
  'compile-error': m.errors_compile_error,
  'language-not-allowed': m.errors_language_not_allowed,
  'assessment-read-only': m.errors_assessment_read_only,
  'grade-not-released': m.errors_grade_not_released,
  'grade-own-attempt': m.errors_grade_own_attempt,
  'ai-disabled': m.errors_ai_disabled,
  'ai-budget-exhausted': m.errors_ai_budget_exhausted,
  'ai-rate-limited': m.errors_ai_rate_limited,
  'ai-run-cancelled': m.errors_ai_run_cancelled,
  'ai-provider-unavailable': m.errors_ai_provider_unavailable,
  'reset-code-invalid': m.errors_reset_code_invalid,
}

/** The user-facing text of any thrown error: the code's text for an ApiError, "no connection" otherwise. */
export const presentError = (error: unknown): string =>
  error instanceof ApiError ? messages[error.code]() : m.errors_network()
