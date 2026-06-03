'use client'

import { useTranslations } from 'next-intl'
import EmbedObjectsComponent from './EmbedObjectsComponent'
import type { EmbedNodeAttrs } from './EmbedObjectsComponent'
import { EmbedObjectsErrorBoundary } from './EmbedObjectsErrorBoundary'
import type { TypedNodeViewProps } from '@components/Objects/Editor/core/nodeview-types'

/**
 * Thin wrapper that renders EmbedObjectsComponent inside an error boundary.
 * Requirement 10.4: If a blockEmbed node fails to render (e.g., missing or
 * malformed src attribute), the editor renders a visible error placeholder
 * in place of the node and does NOT crash or unmount the editor.
 */
const EmbedObjectsWithBoundary = (props: TypedNodeViewProps<EmbedNodeAttrs>) => {
  const t = useTranslations('DashPage.CourseManagement.Dashboard.EmbedObjects')
  return (
    <EmbedObjectsErrorBoundary title={t('embeddedContent')} message={t('embeddedBlockRenderError')}>
      <EmbedObjectsComponent {...props} />
    </EmbedObjectsErrorBoundary>
  )
}

export default EmbedObjectsWithBoundary
