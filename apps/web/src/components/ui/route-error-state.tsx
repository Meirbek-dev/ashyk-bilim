'use client'

import { useEffect } from 'react'

import { ErrorState } from '@/components/ui/error-state'
import { reportClientError } from '@/services/telemetry/client'

interface RouteErrorStateProps {
  actionLabel?: string
  className?: string
  description: string
  error: Error & { digest?: string }
  reset: () => void
  scope: string
  title: string
  variant?: 'page' | 'section'
}

export function RouteErrorState({
  actionLabel = 'Retry',
  className,
  description,
  error,
  reset,
  scope,
  title,
  variant = 'section',
}: RouteErrorStateProps) {
  useEffect(() => {
    void reportClientError({
      digest: error.digest,
      error: {
        cause: error.cause,
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      page: typeof globalThis.window !== 'undefined' ? globalThis.location.pathname : scope,
      scope,
      url: typeof globalThis.window !== 'undefined' ? globalThis.location.href : scope,
    }).catch(() => undefined)
  }, [error, scope])

  const content = (
    <ErrorState
      actionLabel={actionLabel}
      description={description}
      error={error}
      onAction={reset}
      reference={error.digest}
      title={title}
      variant={variant}
    />
  )

  if (className === undefined) {
    return content
  }

  return (
    <ErrorState
      actionLabel={actionLabel}
      className={className}
      description={description}
      error={error}
      onAction={reset}
      reference={error.digest}
      title={title}
      variant={variant}
    />
  )
}
