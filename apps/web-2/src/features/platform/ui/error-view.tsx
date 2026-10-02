import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { useEffect } from 'react'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import { reportClientError } from '#/shared/lib/client-errors'
import { Alert } from '#/shared/ui/alert'
import { Button } from '#/shared/ui/button'

/** Route error boundary: says what happened and gives the request id for support (spec 7.11). */
export function ErrorView({ error }: ErrorComponentProps) {
  const router = useRouter()
  const requestId = error instanceof ApiError ? error.requestId : null
  useEffect(() => {
    if (!(error instanceof ApiError)) reportClientError('render', error)
  }, [error])
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8">
      <h1 className="text-xl font-semibold">{m.platform_error_title()}</h1>
      {requestId ? <Alert>{m.platform_error_request_id({ id: requestId })}</Alert> : null}
      <div>
        <Button onClick={() => void router.invalidate()}>{m.platform_error_retry()}</Button>
      </div>
    </section>
  )
}
