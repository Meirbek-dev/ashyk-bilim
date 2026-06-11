'use client'

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface AiWorkspaceProps {
  children: ReactNode
  className?: string
}

export function AiWorkspace({ children, className }: AiWorkspaceProps) {
  return <section className={cn('flex min-h-0 flex-1 flex-col bg-background', className)}>{children}</section>
}
