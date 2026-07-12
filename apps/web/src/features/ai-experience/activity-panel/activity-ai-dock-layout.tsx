'use client'

import { cn } from '@/lib/utils'

import { ActivityAIPanel } from './activity-ai-panel'
import { useActivityAIUrlState } from './activity-ai-url-state'
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
 * Keeps the workspace and assistant in one responsive layout so the assistant never
 * covers the content it is meant to explain on desktop.
 */
export function ActivityAIDockLayout({
  children,
  className,
  defaultMode,
  enabled,
  panel,
  scope,
}: ActivityAIDockLayoutProps) {
  const { open } = useActivityAIUrlState(defaultMode)
  const docked = enabled !== false && panel !== null && open

  return (
    <div className={cn('grid min-w-0 items-start', docked && 'xl:grid-cols-[minmax(0,1fr)_minmax(30rem,36rem)]')}>
      <div className={cn('min-w-0', className)}>{children}</div>
      {panel !== null ? <ActivityAIPanel scope={scope}>{panel}</ActivityAIPanel> : null}
    </div>
  )
}
