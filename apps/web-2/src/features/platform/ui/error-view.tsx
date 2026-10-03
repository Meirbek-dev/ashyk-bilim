import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import { ErrorAlert } from '#/shared/components/error-alert'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'

import { ForbiddenView } from './forbidden-view'

/** Route error boundary: what happened, Retry, and the request id for support (spec 7.11). 403 in place.
 * Unexpected errors are reported by `onCaughtError` in src/client.tsx. */
export function ErrorView({ error }: ErrorComponentProps) {
  const router = useRouter()
  const apiError = error instanceof ApiError ? error : null
  if (apiError?.status === 403) return <ForbiddenView />
  return (
    <section className="flex max-w-prose flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">{m.platform_error_title()}</h1>
      {apiError ? <ErrorAlert>{presentError(apiError)}</ErrorAlert> : null}
      {apiError?.requestId ? (
        <p className="text-sm text-muted-foreground select-all">
          {m.platform_error_request_id({ id: apiError.requestId })}
        </p>
      ) : null}
      <Button variant="outline" onClick={() => void router.invalidate()}>
        {m.platform_error_retry()}
      </Button>
    </section>
  )
}
