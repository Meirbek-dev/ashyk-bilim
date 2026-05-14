'use client';

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { TypedNodeViewProps } from '@components/Objects/Editor/core';
import type { EmbedBlockAttrs } from './EmbedBlock';
import YouTubeNodeView from './YouTubeNodeView';
import ExcalidrawNodeView from './ExcalidrawNodeView';
import TldrawNodeView from './TldrawNodeView';

// ============================================================================
// clampEmbedHeight utility
// ============================================================================

/**
 * Clamps a raw height value to the valid embed height range [200, 1200].
 */
export function clampEmbedHeight(raw: number): number {
  return Math.min(1200, Math.max(200, raw));
}

// ============================================================================
// Error Boundary
// ============================================================================

interface EmbedErrorBoundaryProps {
  embedType: string | null;
  children: ReactNode;
}

interface EmbedErrorBoundaryState {
  hasError: boolean;
}

class EmbedErrorBoundary extends Component<EmbedErrorBoundaryProps, EmbedErrorBoundaryState> {
  constructor(props: EmbedErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): EmbedErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[EmbedBlock] NodeView render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      const label = this.props.embedType ?? 'embed';
      return (
        <div
          className="flex min-h-[120px] w-full items-center justify-center rounded-xl border border-red-200 bg-red-50 p-6 text-center"
          role="alert"
        >
          <div>
            <p className="text-sm font-semibold capitalize text-red-700">{label} embed</p>
            <p className="mt-1 text-xs text-red-500">
              This embed could not be rendered. Please try editing or removing it.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// EmbedBlockNodeView — root dispatcher
// ============================================================================

const EmbedBlockNodeView = (props: TypedNodeViewProps<EmbedBlockAttrs>) => {
  const { type } = props.node.attrs;

  const renderSubView = () => {
    switch (type) {
      case 'youtube':
        return (
          <EmbedErrorBoundary embedType="youtube">
            <YouTubeNodeView {...props} />
          </EmbedErrorBoundary>
        );
      case 'excalidraw':
        return (
          <EmbedErrorBoundary embedType="excalidraw">
            <ExcalidrawNodeView {...props} />
          </EmbedErrorBoundary>
        );
      case 'tldraw':
        return (
          <EmbedErrorBoundary embedType="tldraw">
            <TldrawNodeView {...props} />
          </EmbedErrorBoundary>
        );
      default:
        return (
          <div className="flex min-h-[120px] w-full items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
            <p className="text-sm text-gray-500">
              Unknown embed type{type ? `: ${type}` : ''}. Please edit this block.
            </p>
          </div>
        );
    }
  };

  return <NodeViewWrapper className="embed-block-node-view w-full">{renderSubView()}</NodeViewWrapper>;
};

export default EmbedBlockNodeView;
