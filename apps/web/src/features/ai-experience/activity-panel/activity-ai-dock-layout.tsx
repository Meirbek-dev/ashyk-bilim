'use client'

import { cn } from '@/lib/utils'

import { ActivityAIPanel, useActivityAIDockStyle } from './activity-ai-panel'
import type { ActivityAIMode } from './activity-ai-url-state'
import type { AIScope } from './use-ai-scope-capabilities'

interface ActivityAIDockLayoutProps {
  children: React.ReactNode
  className?: string
  defaultMode: ActivityAIMode
  enabled?: boolean
  /** Pass `null` (not omitted) when the AI surface must not mount at all in the current state. */
  panel: React.ReactNode | null
  scope: AIScope
}

/**
 * Pairs the AI dock's content-spacing style with the floating `ActivityAIPanel` by
 * construction, so a host page cannot render one without the other. This is the only
 * place `ActivityAIPanel` should be rendered from — every activity/studio/editor host
 * should go through this component instead of calling `useActivityAIDockStyle` and
 * spreading the resulting style onto its own root element by hand.
 */
export function ActivityAIDockLayout({
  children,
  className,
  defaultMode,
  enabled,
  panel,
  scope,
}: ActivityAIDockLayoutProps) {
  const dockStyle = useActivityAIDockStyle({ defaultMode, enabled, surface: scope.surface })

  return (
    <>
      <div className={cn('transition-[padding] duration-200 ease-out', className)} style={dockStyle}>
        {children}
      </div>
      {panel !== null ? <ActivityAIPanel scope={scope}>{panel}</ActivityAIPanel> : null}
    </>
  )
}
