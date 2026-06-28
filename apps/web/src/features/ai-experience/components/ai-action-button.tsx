'use client'

import { SparklesIcon } from 'lucide-react'
import type * as React from 'react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

type AIActionButtonProps = React.ComponentProps<typeof Button> & {
  pending?: boolean | undefined
  pendingLabel?: string | undefined
}

export function AIActionButton({
  pending = false,
  pendingLabel = 'Working',
  children,
  disabled,
  ...props
}: AIActionButtonProps) {
  return (
    <Button disabled={disabled || pending} aria-busy={pending} {...props}>
      {pending ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
      <span aria-live="polite">{pending ? pendingLabel : children}</span>
    </Button>
  )
}
