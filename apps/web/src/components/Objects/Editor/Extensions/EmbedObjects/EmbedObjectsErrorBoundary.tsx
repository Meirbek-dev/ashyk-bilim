'use client'

import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { InlineError } from '@/components/ui/error-state'
import { reportClientError } from '@/services/telemetry/client'

import { useTranslations } from 'next-intl'

// ============================================================================
// Error Boundary for EmbedObjectsComponent (legacy blockEmbed NodeView)
// Requirement 10.4: If a blockEmbed node fails to render, show a visible
// error placeholder and do NOT crash or unmount the editor.
// ============================================================================

interface EmbedObjectsErrorBoundaryProps {
  children: ReactNode
  title?: ReactNode
  message?: ReactNode
}

interface EmbedObjectsErrorBoundaryState {
  error: Error | null
  hasError: boolean
}

function EmbedObjectsErrorFallback({
  message,
  title,
  error,
}: {
  message?: ReactNode
  title?: ReactNode
  error: Error | null
}) {
  const t = useTranslations('DashPage.Editor.EmbedObjects')
  return (
    <InlineError
      className="min-h-[120px]"
      description={message ?? t('embeddedBlockRenderErrorFallback')}
      error={error}
      title={title ?? t('embeddedContentFallback')}
    />
  )
}

export class EmbedObjectsErrorBoundary extends Component<
  EmbedObjectsErrorBoundaryProps,
  EmbedObjectsErrorBoundaryState
> {
  public constructor(props: EmbedObjectsErrorBoundaryProps) {
    super(props)
    this.state = { error: null, hasError: false }
  }

  public static getDerivedStateFromError(error: Error): EmbedObjectsErrorBoundaryState {
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
      phase: 'embed-objects-render',
      scope: 'EmbedObjectsErrorBoundary',
    }).catch(() => undefined)
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <EmbedObjectsErrorFallback
          message={this.props.message}
          error={this.state.error}
          title={this.props.title}
        />
      )
    }

    return this.props.children
  }
}

