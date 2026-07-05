'use client'

import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { InlineError } from '@/components/ui/error-state'
import { reportClientError } from '@/services/telemetry/client'

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
        <InlineError
          className="min-h-[120px]"
          description={this.props.message ?? 'This embed could not be rendered.'}
          error={this.state.error}
          title={this.props.title ?? 'Embed failed to render'}
        />
      )
    }

    return this.props.children
  }
}
