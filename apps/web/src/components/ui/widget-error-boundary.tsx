'use client'

 

import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ErrorState, InlineError } from '@/components/ui/error-state'
import { reportClientError, serializeClientError } from '@/services/telemetry/client'

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
  WidgetErrorBoundaryProps & {
    onQueryReset?: () => void
    defaultTitle: string
    defaultDescription: string
    defaultActionLabel: string
  },
  WidgetErrorBoundaryState
> {
  public constructor(
    props: WidgetErrorBoundaryProps & {
      onQueryReset?: () => void
      defaultTitle: string
      defaultDescription: string
      defaultActionLabel: string
    },
  ) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  public static getDerivedStateFromError(error: Error): WidgetErrorBoundaryState {
    return { error, hasError: true }
  }

  public override componentDidCatch(error: Error, info: ErrorInfo) {
    void reportClientError({
      error: { ...serializeClientError(error), componentStack: info.componentStack },
      phase: 'widget-error-boundary',
      scope: this.props.scope,
    }).catch(() => undefined)
  }

  private readonly handleReset = () => {
    this.props.onQueryReset?.()
     
    this.setState({ error: null, hasError: false })
  }

  public override render() {
    if (this.state.hasError) {
      const title = this.props.title ?? this.props.defaultTitle
      const description = this.props.description ?? this.props.defaultDescription

      if (this.props.variant === 'inline') {
        return <InlineError title={title} description={description} error={this.state.error} />
      }

      return (
        <ErrorState
          title={title}
          description={description}
          error={this.state.error}
          onAction={this.handleReset}
          actionLabel={this.props.defaultActionLabel}
          variant="section"
        />
      )
    }

    return this.props.children
  }
}

export function WidgetErrorBoundary(props: WidgetErrorBoundaryProps) {
  const t = useTranslations('Components.WidgetErrorBoundary')
  const defaultTitle = t('defaultTitle')
  const defaultDescription = t('defaultDescription')
  const defaultActionLabel = t('retry')

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <BaseWidgetErrorBoundary
          {...props}
          onQueryReset={reset}
          defaultTitle={defaultTitle}
          defaultDescription={defaultDescription}
          defaultActionLabel={defaultActionLabel}
        />
      )}
    </QueryErrorResetBoundary>
  )
}

