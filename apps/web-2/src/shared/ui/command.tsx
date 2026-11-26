'use client'

import type * as React from 'react'
import {
  Command as CommandPrimitive,
  CommandEmpty as CommandPrimitiveEmpty,
  CommandGroup as CommandPrimitiveGroup,
  CommandGroupLabel as CommandPrimitiveGroupLabel,
  CommandInput as CommandPrimitiveInput,
  CommandItem as CommandPrimitiveItem,
  CommandList as CommandPrimitiveList,
  CommandStatus as CommandPrimitiveStatus,
} from '@ui-sdk/react/command'
import { cn } from 'cn'

import { m } from '#/paraglide/messages'
import { InputGroup } from '#/shared/ui/input-group.tsx'
import { listAnnouncement } from '#/shared/ui/list-announcement.ts'

type WithClassName<P> = Omit<P, 'className'> & { className?: string }

function Command({
  className,
  announcement = listAnnouncement,
  pendingAnnouncement = m.ui_loading(),
  ...props
}: WithClassName<React.ComponentProps<typeof CommandPrimitive>>) {
  return (
    <CommandPrimitive
      announcement={announcement}
      pendingAnnouncement={pendingAnnouncement}
      className={cn(
        'flex w-full max-w-none flex-col gap-4 overflow-visible rounded-none border-0 bg-transparent text-inherit',
        className,
      )}
      {...props}
    />
  )
}

function CommandInput({ className, ...props }: WithClassName<React.ComponentProps<typeof CommandPrimitiveInput>>) {
  return (
    <InputGroup
      className={cn(
        'has-[[data-slot=command-input]:focus-visible]:border-ring has-[[data-slot=command-input]:focus-visible]:ring-3 has-[[data-slot=command-input]:focus-visible]:ring-ring/30',
        className,
      )}
    >
      <CommandPrimitiveInput
        className="h-full w-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 py-1 text-base text-inherit shadow-none outline-none placeholder:text-muted-foreground"
        {...props}
      />
    </InputGroup>
  )
}

function CommandList({ className, ...props }: WithClassName<React.ComponentProps<typeof CommandPrimitiveList>>) {
  return (
    <CommandPrimitiveList
      className={cn('max-h-96 scroll-py-1 overflow-y-auto overscroll-contain p-0', className)}
      {...props}
    />
  )
}

function CommandItem({ className, ...props }: WithClassName<React.ComponentProps<typeof CommandPrimitiveItem>>) {
  return (
    <CommandPrimitiveItem
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-highlighted:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

function CommandGroup({ className, ...props }: WithClassName<React.ComponentProps<typeof CommandPrimitiveGroup>>) {
  return <CommandPrimitiveGroup className={cn(className)} {...props} />
}

function CommandGroupLabel({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof CommandPrimitiveGroupLabel>>) {
  return (
    <CommandPrimitiveGroupLabel className={cn('px-2 py-1.5 text-xs text-muted-foreground', className)} {...props} />
  )
}

function CommandEmpty({ className, ...props }: WithClassName<React.ComponentProps<typeof CommandPrimitiveEmpty>>) {
  return (
    <CommandPrimitiveEmpty className={cn('py-2 text-center text-sm text-muted-foreground', className)} {...props} />
  )
}

function CommandStatus({ className, ...props }: WithClassName<React.ComponentProps<typeof CommandPrimitiveStatus>>) {
  return <CommandPrimitiveStatus className={cn('px-2 py-2 text-sm text-muted-foreground', className)} {...props} />
}

export { Command, CommandEmpty, CommandGroup, CommandGroupLabel, CommandInput, CommandItem, CommandList, CommandStatus }
