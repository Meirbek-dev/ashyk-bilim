'use client'

import React, { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { QueryErrorResetBoundary } from '@tanstack/react-query'

import { ErrorState, InlineError } from '@/components/ui/error-state'
import { reportClientError } from '@/services/telemetry/client'

interface WidgetErrorBoundaryProps {
  children: ReactNode
  description?: ReactNode
  scope: string
  title?: ReactNode
  variant?: 'inline' | 'section'
}

interface WidgetErrorBoundaryState {
  error: Error | null
  hasError: boolean
}

class BaseWidgetErrorBoundary extends Component<
  WidgetErrorBoundaryProps & { onQueryReset?: () => void },
  WidgetErrorBoundaryState
> {
  public constructor(props: WidgetErrorBoundaryProps & { onQueryReset?: () => void }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  public static getDerivedStateFromError(error: Error): WidgetErrorBoundaryState {
    return { error, hasError: true }
  }

  public override componentDidCatch(error: Error, info: ErrorInfo) {
    void reportClientError({
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
        componentStack: info.componentStack,
      },
      phase: 'widget-error-boundary',
      scope: this.props.scope,
    }).catch(() => undefined)
  }

  private handleReset = () => {
    this.props.onQueryReset?.()
    this.setState({ error: null, hasError: false })
  }

  public override render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || 'Component crashed'
      const title = this.props.title ?? 'Failed to render component'
      const description = this.props.description ?? errorMsg

      if (this.props.variant === 'inline') {
        return (
          <InlineError
            title={title as string}
            description={description}
            error={this.state.error}
          />
        )
      }

      return (
        <ErrorState
          title={title}
          description={description}
          error={this.state.error}
          onAction={this.handleReset}
          actionLabel="Retry"
          variant="section"
        />
      )
    }

    return this.props.children
  }
}

export function WidgetErrorBoundary(props: WidgetErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <BaseWidgetErrorBoundary {...props} onQueryReset={reset} />
      )}
    </QueryErrorResetBoundary>
  )
}
