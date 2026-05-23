'use client';

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

// ============================================================================
// Error Boundary for EmbedObjectsComponent (legacy blockEmbed NodeView)
// Requirement 10.4: If a blockEmbed node fails to render, show a visible
// error placeholder and do NOT crash or unmount the editor.
// ============================================================================

interface EmbedObjectsErrorBoundaryProps {
  children: ReactNode;
  title?: ReactNode;
  message?: ReactNode;
}

interface EmbedObjectsErrorBoundaryState {
  hasError: boolean;
}

export class EmbedObjectsErrorBoundary extends Component<
  EmbedObjectsErrorBoundaryProps,
  EmbedObjectsErrorBoundaryState
> {
  public constructor(props: EmbedObjectsErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  public static getDerivedStateFromError(): EmbedObjectsErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[EmbedObjects] blockEmbed NodeView render error:', error, info);
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex min-h-[120px] w-full items-center justify-center rounded-xl border border-amber-200 bg-amber-50 p-6 text-center"
          role="alert"
        >
          <div>
            <p className="text-sm font-semibold text-amber-700">{this.props.title || 'Embedded content'}</p>
            <p className="mt-1 text-xs text-amber-600">
              {this.props.message || 'This embedded block could not be rendered. Please try editing or removing it.'}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
