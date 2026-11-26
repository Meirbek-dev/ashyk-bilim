import * as React from 'react'
import {
  Avatar as AvatarPrimitive,
  AvatarFallback as AvatarFallbackPrimitive,
  AvatarImage as AvatarImagePrimitive,
} from '@ui-sdk/react/avatar'
import { cn } from 'cn'

type WithClassName<P> = Omit<P, 'className'> & { className?: string }

function Avatar({
  className,
  size = 'default',
  ...props
}: WithClassName<React.ComponentProps<typeof AvatarPrimitive>> & {
  size?: 'default' | 'sm' | 'lg'
}) {
  return (
    <AvatarPrimitive
      data-size={size}
      className={cn(
        'group/avatar relative flex size-8 shrink-0 overflow-visible rounded-full bg-transparent font-normal select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6',
        className,
      )}
      {...props}
    />
  )
}

function AvatarImage({ className, ...props }: WithClassName<React.ComponentProps<typeof AvatarImagePrimitive>>) {
  return (
    <AvatarImagePrimitive className={cn('aspect-square size-full rounded-full object-cover', className)} {...props} />
  )
}

function AvatarFallback({ className, ...props }: WithClassName<React.ComponentProps<typeof AvatarFallbackPrimitive>>) {
  return (
    <AvatarFallbackPrimitive
      className={cn(
        'flex size-full items-center justify-center rounded-full bg-highlight-soft text-sm text-link group-data-[size=sm]/avatar:text-xs',
        className,
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
