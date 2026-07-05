import { Badge } from '@/components/ui/badge'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

import { getLmsStatusModel } from './types'
import type { LmsStatus, LmsStatusTone } from './types'

const badgeVariantByTone = {
  neutral: 'outline',
  success: 'success',
  warning: 'warning',
  destructive: 'destructive',
} as const satisfies Record<LmsStatusTone, ComponentProps<typeof Badge>['variant']>

export function LmsStatusBadge({
  status,
  label,
  className,
}: {
  status: LmsStatus
  label?: string
  className?: string
}) {
  const model = getLmsStatusModel(status)

  return (
    <Badge variant={badgeVariantByTone[model.tone]} className={cn(className)}>
      {label ?? model.label}
    </Badge>
  )
}
