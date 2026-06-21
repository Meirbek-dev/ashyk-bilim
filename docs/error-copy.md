# Error Copy Guidelines

Date: 2026-06-21

Use these rules for route boundaries, inline states, form errors, toasts, and support references.

## Principles

- Say what happened.
- Say what the user can do next.
- Preserve user work whenever possible.
- Show a support reference for internal, dependency, timeout, and unknown failures.
- Do not expose backend internals or raw exception messages.
- Do not report expected validation errors as crashes.

## Patterns

| Situation              | Copy Pattern                                                                    | UI                                                      |
| ---------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Validation             | "Check the highlighted fields and try again."                                   | Field-level errors first, inline summary second.        |
| Auth required          | "Your session expired. Sign in again to continue."                              | Session recovery or sign-in action.                     |
| Permission denied      | "You do not have access to this resource."                                      | Explain access/request path.                            |
| Not found              | "This item is no longer available or you do not have access."                   | Link back to the parent list.                           |
| Conflict               | "This was changed elsewhere. Review the latest version before saving."          | Conflict resolution, never discard local work silently. |
| Rate limited           | "Too many attempts. Try again shortly."                                         | Disable action until retry window.                      |
| Dependency unavailable | "This service is temporarily unavailable. Your work is saved; try again later." | Retry action and preserved state.                       |
| Timeout/network        | "The request took too long. Check your connection and retry."                   | Retry and offline/pending state.                        |
| Internal error         | "Something went wrong. Retry or contact support with the reference below."      | Generic error state with support reference.             |

## Product-Specific Notes

- Assessment save failures must keep local answers and show a dirty/offline/conflict state.
- Code test failures are not app errors. Code runner outages are app/dependency errors.
- File upload validation should happen before upload when possible.
- Course publish/readiness failures should show checklist or field-level actions, not a generic toast.
- AI moderation, provider outage, streaming interruption, and malformed output must use different codes and copy.
