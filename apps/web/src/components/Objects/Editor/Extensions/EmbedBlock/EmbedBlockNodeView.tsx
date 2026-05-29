'use client'

import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { useTranslations } from 'next-intl'
import type { TypedNodeViewProps } from '@components/Objects/Editor/core/nodeview-types'
import type { EmbedBlockAttrs } from './EmbedBlock'
import YouTubeNodeView from './YouTubeNodeView'
import ExcalidrawNodeView from './ExcalidrawNodeView'
import TldrawNodeView from './TldrawNodeView'
import GenericEmbedNodeView from './GenericEmbedNodeView'
import { getEmbedProvider } from './embed-options'

// ============================================================================
// Error Boundary
// ============================================================================

interface EmbedErrorBoundaryProps {
  embedType: string | null
  title: string
  message: string
  children: ReactNode
}

interface EmbedErrorBoundaryState {
  hasError: boolean
}

class EmbedErrorBoundary extends Component<EmbedErrorBoundaryProps, EmbedErrorBoundaryState> {
  public constructor(props: EmbedErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  public static getDerivedStateFromError(): EmbedErrorBoundaryState {
    return { hasError: true }
  }

  public override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[EmbedBlock] NodeView render error:', error, info)
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex min-h-[120px] w-full items-center justify-center rounded-xl border border-red-200 bg-red-50 p-6 text-center"
          role="alert"
        >
          <div>
            <p className="text-sm font-semibold text-red-700 capitalize">{this.props.title}</p>
            <p className="mt-1 text-xs text-red-500">{this.props.message}</p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// ============================================================================
// EmbedBlockNodeView — root dispatcher
// ============================================================================

const EmbedBlockNodeView = (props: TypedNodeViewProps<EmbedBlockAttrs>) => {
  const { type } = props.node.attrs
  const provider = getEmbedProvider(type)
  const t = useTranslations('DashPage.CourseManagement.Dashboard.EmbedObjects')

  const renderSubView = () => {
    switch (type) {
      case 'youtube': {
        return (
          <EmbedErrorBoundary
            embedType="youtube"
            title={t('failedToRenderEmbed', { label: 'YouTube' })}
            message={t('embedRenderErrorMessage')}
          >
            <YouTubeNodeView {...props} />
          </EmbedErrorBoundary>
        )
      }
      case 'excalidraw': {
        return (
          <EmbedErrorBoundary
            embedType="excalidraw"
            title={t('failedToRenderEmbed', { label: 'Excalidraw' })}
            message={t('embedRenderErrorMessage')}
          >
            <ExcalidrawNodeView {...props} />
          </EmbedErrorBoundary>
        )
      }
      case 'tldraw': {
        return (
          <EmbedErrorBoundary
            embedType="tldraw"
            title={t('failedToRenderEmbed', { label: 'Tldraw' })}
            message={t('embedRenderErrorMessage')}
          >
            <TldrawNodeView {...props} />
          </EmbedErrorBoundary>
        )
      }
      default: {
        if (provider) {
          return (
            <EmbedErrorBoundary
              embedType={provider.type}
              title={t('failedToRenderEmbed', { label: provider.type })}
              message={t('embedRenderErrorMessage')}
            >
              <GenericEmbedNodeView {...props} />
            </EmbedErrorBoundary>
          )
        }

        return (
          <div className="flex min-h-[120px] w-full items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
            <p className="text-sm text-gray-500">{t('unknownEmbedType', { type: type ? `: ${type}` : '' })}</p>
          </div>
        )
      }
    }
  }

  return <NodeViewWrapper className="embed-block-node-view w-full">{renderSubView()}</NodeViewWrapper>
}

export default EmbedBlockNodeView
