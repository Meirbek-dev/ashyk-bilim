import { Badge } from '@/components/ui/badge'
import type { ComponentProps } from 'react'

import { getLmsStatusModel } from './types'
import type { LmsStatus, LmsStatusTone } from './types'

const badgeVariantByTone = {
  neutral: 'outline',
  success: 'success',
  warning: 'warning',
  destructive: 'destructive',
} as const satisfies Record<LmsStatusTone, ComponentProps<typeof Badge>['variant']>

export function LmsStatusBadge({ status }: { status: LmsStatus }) {
  const model = getLmsStatusModel(status)

  return <Badge variant={badgeVariantByTone[model.tone]}>{model.label}</Badge>
}
