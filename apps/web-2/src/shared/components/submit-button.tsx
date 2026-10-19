import type { ComponentProps } from 'react'

import { cn } from '#/shared/lib/utils'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'

type SubmitButtonProps = Omit<ComponentProps<typeof Button>, 'className'> & { pending: boolean; className?: string }

/**
 * A button that sends a request. While `pending` it is aria-disabled with a spinner and keeps keyboard focus (a
 * `disabled` button drops it to <body>); its name stays the label (aria-busy says it is working). `disabled` covers
 * the other reasons it cannot be pressed.
 */
export function SubmitButton({ pending, disabled, className, children, ...props }: SubmitButtonProps) {
  return (
    <Button
      {...props}
      className={cn('aria-disabled:opacity-50', className)}
      disabled={disabled === true || pending}
      focusableWhenDisabled
      aria-busy={pending || undefined}
    >
      {pending ? <Spinner data-icon="inline-start" aria-hidden /> : null}
      {children}
    </Button>
  )
}
