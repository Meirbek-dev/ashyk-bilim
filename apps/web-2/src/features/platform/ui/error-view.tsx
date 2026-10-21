import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import { StatusScreen } from '#/shared/components/status-screen'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'

import { ForbiddenView } from './forbidden-view'

// The fetch failure texts of Node/undici and Chromium ("fetch failed", "Failed to fetch"), Firefox ("NetworkError when
// attempting to fetch resource") and Safari ("Load failed"); an SSR error reaches the browser as a plain Error.
const UNREACHABLE = /fetch failed|failed to fetch|networkerror|load failed/i

// A chunk of an older release the server no longer has (a tab opened before a deploy: Chromium, Firefox, Safari):
// only a full reload brings the new one, so Retry would fail again.
const STALE_BUILD = /dynamically imported module|importing a module script failed/i

/** Route error boundary: what happened, Retry, and the request id for support (spec 7.11). 403 in place.
 * Unexpected errors are reported by `onCaughtError` in src/client.tsx. */
export function ErrorView({ error }: ErrorComponentProps) {
  const router = useRouter()
  const apiError = error instanceof ApiError ? error : null
  if (apiError?.status === 403) return <ForbiddenView />
  // No answer at all (API down or restarting, offline): say so; any other thrown error stays generic.
  const stale = !apiError && error instanceof Error && STALE_BUILD.test(error.message)
  const unreachable = !stale && !apiError && error instanceof Error && UNREACHABLE.test(error.message)
  if (stale)
    return (
      <StatusScreen title={m.platform_error_stale_title()} text={m.platform_error_stale_text()}>
        <Button onClick={() => void router.navigate({ href: router.state.location.href, reloadDocument: true })}>
          {m.platform_error_reload()}
        </Button>
      </StatusScreen>
    )
  return (
    <StatusScreen
      title={m.platform_error_title()}
      text={apiError ? presentError(apiError) : unreachable ? m.errors_network() : m.platform_error_text()}
    >
      <Button onClick={() => void router.invalidate()}>{m.platform_error_retry()}</Button>
      {apiError?.requestId ? (
        <p className="basis-full text-sm text-muted-foreground select-all">
          {m.platform_error_request_id({ id: apiError.requestId })}
        </p>
      ) : null}
    </StatusScreen>
  )
}
