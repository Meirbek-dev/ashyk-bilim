'use client'

import type * as React from 'react'
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemIndicator,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from '@ui-sdk/react/menu'
import { cn } from 'cn'
import { ChevronRightIcon, CheckIcon } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { usePopupRoot } from '#/shared/ui/body-container'

type WithClassName<P> = Omit<P, 'className'> & { className?: string }
type WithNodeChildren<P> = Omit<P, 'children'> & { children?: React.ReactNode }

const itemClass =
  "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

const contentClass =
  'max-h-(--available-height) min-w-40 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border-0 bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-ending-style:animate-out data-ending-style:overflow-hidden data-ending-style:fade-out-0 data-ending-style:zoom-out-95'

function DropdownMenu({
  pendingAnnouncement = m.ui_loading(),
  container,
  open,
  ...props
}: React.ComponentProps<typeof Menu>) {
  return <Menu pendingAnnouncement={pendingAnnouncement} {...props} {...usePopupRoot(container, open)} />
}

const DropdownMenuTrigger = MenuTrigger

function DropdownMenuContent({
  align = 'start',
  sideOffset = 4,
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof MenuContent>>) {
  return (
    <MenuContent
      align={align}
      sideOffset={sideOffset}
      // Fits its longest item, never narrower than the trigger; past 24rem (a long course name) the items wrap.
      className={cn(
        contentClass,
        'w-max min-w-[max(8rem,var(--anchor-width))] max-w-[min(var(--available-width),max(24rem,var(--anchor-width)))]',
        className,
      )}
      {...props}
    />
  )
}

const DropdownMenuGroup = MenuGroup

function DropdownMenuLabel({ className, ...props }: WithClassName<React.ComponentProps<typeof MenuGroupLabel>>) {
  return <MenuGroupLabel className={cn('px-2 py-1.5 text-xs text-muted-foreground', className)} {...props} />
}

function DropdownMenuItem({ className, ...props }: WithClassName<React.ComponentProps<typeof MenuItem>>) {
  return (
    <MenuItem
      className={cn(
        'group/dropdown-menu-item',
        itemClass,
        'not-data-destructive:data-highlighted:**:text-accent-foreground data-destructive:text-destructive data-destructive:data-highlighted:bg-destructive/10 data-destructive:data-highlighted:text-destructive data-destructive:*:[svg]:text-destructive',
        className,
      )}
      {...props}
    />
  )
}

const DropdownMenuSub = MenuSub

function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: WithClassName<WithNodeChildren<React.ComponentProps<typeof MenuSubTrigger>>>) {
  return (
    <MenuSubTrigger
      className={cn(
        itemClass,
        'h-auto w-full justify-start border-0 bg-transparent font-normal data-highlighted:**:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon aria-hidden className="ml-auto rtl:rotate-180" />
    </MenuSubTrigger>
  )
}

function DropdownMenuSubContent({
  sideOffset = 0,
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof MenuSubContent>>) {
  return (
    <MenuSubContent sideOffset={sideOffset} className={cn(contentClass, 'w-auto min-w-24 p-1', className)} {...props} />
  )
}

function ItemCheck() {
  return (
    <MenuItemIndicator className="pointer-events-none absolute start-auto end-2 flex items-center justify-center">
      <CheckIcon aria-hidden />
    </MenuItemIndicator>
  )
}

const DropdownMenuRadioGroup = MenuRadioGroup

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: WithClassName<WithNodeChildren<React.ComponentProps<typeof MenuRadioItem>>>) {
  return (
    <MenuRadioItem
      className={cn(itemClass, 'pe-8 ps-2 data-highlighted:**:text-accent-foreground', className)}
      {...props}
    >
      <ItemCheck />
      {children}
    </MenuRadioItem>
  )
}

function DropdownMenuSeparator({ className, ...props }: WithClassName<React.ComponentProps<typeof MenuSeparator>>) {
  return <MenuSeparator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        'ml-auto text-xs tracking-widest text-muted-foreground group-data-highlighted/dropdown-menu-item:text-accent-foreground',
        className,
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
