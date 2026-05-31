'use client'

import { DashBreadcrumbs } from '@/components/ui/app-breadcrumbs'
import type { DashBreadcrumbType } from '@/components/ui/app-breadcrumbs'
import { cn } from '@/lib/utils'
import type React from 'react'

interface DashHeaderProps {
  breadcrumbType?: DashBreadcrumbType
  lastBreadcrumb?: string
  title: React.ReactNode
  description?: React.ReactNode
  badge?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

export default function DashHeader({
  breadcrumbType,
  lastBreadcrumb,
  title,
  description,
  badge,
  actions,
  children,
  className,
}: DashHeaderProps) {
  return (
    <header className={cn('bg-background border-border/80 border-b shadow-2xs w-full transition-all', className)}>
      <div className="px-4 md:px-8">
        {/* Breadcrumbs Row if type is provided */}
        {breadcrumbType && (
          <div className="pt-2">
            <DashBreadcrumbs type={breadcrumbType} last_breadcrumb={lastBreadcrumb} />
          </div>
        )}

        {/* Title and Actions Row */}
        <div
          className={cn(
            'flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between',
            !breadcrumbType && 'pt-6',
          )}
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-foreground text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
              {badge && <div className="flex items-center">{badge}</div>}
            </div>
            {description && (
              <p className="text-muted-foreground max-w-4xl text-xs leading-normal sm:text-sm">{description}</p>
            )}
          </div>

          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:mt-0">{actions}</div>}
        </div>

        {/* Tabs or sub-elements */}
        {children && <div className="flex w-full scrollbar-none items-end overflow-x-auto select-none">{children}</div>}
      </div>
    </header>
  )
}
