'use client'

import type * as React from 'react'
import {
  Combobox as ComboboxPrimitive,
  ComboboxChip as ComboboxPrimitiveChip,
  ComboboxChipRemove,
  ComboboxChips as ComboboxPrimitiveChips,
  ComboboxClear as ComboboxPrimitiveClear,
  ComboboxContent as ComboboxPrimitiveContent,
  ComboboxEmpty as ComboboxPrimitiveEmpty,
  ComboboxInput as ComboboxPrimitiveInput,
  ComboboxItem as ComboboxPrimitiveItem,
  ComboboxItemIndicator,
  ComboboxList as ComboboxPrimitiveList,
  ComboboxTrigger as ComboboxPrimitiveTrigger,
  type ComboboxProps,
} from '@ui-sdk/react/combobox'
import { cn } from 'cn'
import { ChevronDownIcon, XIcon, CheckIcon } from 'lucide-react'

import { Button } from '#/shared/ui/button.tsx'
import { InputGroup, InputGroupButton } from '#/shared/ui/input-group.tsx'
import { listAnnouncement } from '#/shared/ui/list-announcement.ts'
import { usePopupRoot } from '#/shared/ui/body-container'

type WithClassName<P> = Omit<P, 'className'> & { className?: string }
type WithNodeChildren<P> = Omit<P, 'children'> & { children?: React.ReactNode }

function Combobox<T = string, Multiple extends boolean | undefined = false>(props: ComboboxProps<T, Multiple>) {
  return (
    <ComboboxPrimitive<T, Multiple>
      {...props}
      {...usePopupRoot(props.container, props.open)}
      announcement={props.announcement ?? listAnnouncement}
    />
  )
}

function ComboboxTrigger({
  className,
  children,
  ...props
}: WithClassName<React.ComponentProps<typeof ComboboxPrimitiveTrigger>>) {
  return (
    <ComboboxPrimitiveTrigger
      render={<InputGroupButton size="icon-xs" variant="ghost" />}
      className={cn("data-open:bg-transparent [&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    >
      {children ?? <ChevronDownIcon aria-hidden className="pointer-events-none size-4 text-muted-foreground" />}
    </ComboboxPrimitiveTrigger>
  )
}

function ComboboxClear({ className, ...props }: WithClassName<React.ComponentProps<typeof ComboboxPrimitiveClear>>) {
  return (
    <ComboboxPrimitiveClear
      render={<InputGroupButton variant="ghost" size="icon-xs" />}
      className={cn(className)}
      {...props}
    >
      <XIcon aria-hidden className="pointer-events-none" />
    </ComboboxPrimitiveClear>
  )
}

function ComboboxInput({
  className,
  children,
  ...props
}: WithClassName<React.ComponentProps<typeof ComboboxPrimitiveInput>> & {
  children?: React.ReactNode
}) {
  return (
    <InputGroup
      className={cn(
        'w-auto has-[[data-slot=combobox-input]:focus-visible]:border-ring has-[[data-slot=combobox-input]:focus-visible]:ring-3 has-[[data-slot=combobox-input]:focus-visible]:ring-ring/30',
        className,
      )}
    >
      <ComboboxPrimitiveInput
        className="h-full w-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 py-1 text-base text-inherit shadow-none outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed"
        {...props}
      />
      {children}
    </InputGroup>
  )
}

function ComboboxContent({
  className,
  sideOffset = 6,
  align = 'start',
  ...props
}: WithClassName<React.ComponentProps<typeof ComboboxPrimitiveContent>>) {
  return (
    <ComboboxPrimitiveContent
      sideOffset={sideOffset}
      align={align}
      className={state =>
        cn(
          'group/combobox-content relative max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-lg border-0 bg-popover p-0 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 [--list-height:var(--available-height)] data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 *:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-8 *:data-[slot=input-group]:border-border *:data-[slot=input-group]:bg-muted *:data-[slot=input-group]:shadow-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-ending-style:animate-out data-ending-style:fade-out-0 data-ending-style:zoom-out-95',
          state.multiple ? 'min-w-(--anchor-width)' : 'min-w-[calc(var(--anchor-width)+--spacing(7))]',
          className,
        )
      }
      {...props}
    />
  )
}

function ComboboxList({ className, ...props }: WithClassName<React.ComponentProps<typeof ComboboxPrimitiveList>>) {
  return (
    <ComboboxPrimitiveList
      className={cn(
        'max-h-[min(calc(--spacing(96)---spacing(9)),calc(var(--list-height)---spacing(9)))] scroll-py-1 overflow-y-auto overscroll-contain p-1 empty:p-0',
        className,
      )}
      {...props}
    />
  )
}

function ComboboxItem<T = string>({
  className,
  children,
  ...props
}: WithClassName<WithNodeChildren<React.ComponentProps<typeof ComboboxPrimitiveItem<T>>>>) {
  return (
    <ComboboxPrimitiveItem<T>
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pe-8 ps-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-highlighted:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxItemIndicator className="pointer-events-none absolute end-2 flex size-4 items-center justify-center">
        <CheckIcon aria-hidden className="pointer-events-none" />
      </ComboboxItemIndicator>
    </ComboboxPrimitiveItem>
  )
}

function ComboboxEmpty({ className, ...props }: WithClassName<React.ComponentProps<typeof ComboboxPrimitiveEmpty>>) {
  return (
    <ComboboxPrimitiveEmpty
      className={cn('flex w-full justify-center py-2 text-center text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function ComboboxChips({ className, ...props }: WithClassName<React.ComponentProps<typeof ComboboxPrimitiveChips>>) {
  return (
    <ComboboxPrimitiveChips
      className={cn(
        'flex min-h-control flex-wrap items-center gap-1 rounded-md border border-input bg-card bg-clip-padding px-2.5 py-1 text-sm shadow-control transition-[color,border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--input),var(--foreground)_25%)] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 has-data-[slot=combobox-chip]:px-1',
        className,
      )}
      {...props}
    />
  )
}

function ComboboxChip({
  className,
  children,
  removeLabel,
  ...props
}: WithClassName<WithNodeChildren<React.ComponentProps<typeof ComboboxPrimitiveChip>>> & {
  removeLabel?: string
}) {
  return (
    <ComboboxPrimitiveChip
      className={cn(
        'flex min-h-[calc(--spacing(5.25))] w-fit min-w-0 items-center justify-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium wrap-anywhere text-foreground data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 has-data-[slot=combobox-chip-remove]:pe-0',
        className,
      )}
      {...props}
    >
      {children}
      {removeLabel ? (
        <ComboboxChipRemove
          render={<Button variant="ghost" size="icon-xs" />}
          aria-label={removeLabel}
          className="-ms-1 opacity-50 hover:opacity-100"
        >
          <XIcon aria-hidden className="pointer-events-none" />
        </ComboboxChipRemove>
      ) : null}
    </ComboboxPrimitiveChip>
  )
}

function ComboboxChipsInput({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof ComboboxPrimitiveInput>>) {
  return (
    <ComboboxPrimitiveInput
      className={cn(
        'h-auto min-w-16 flex-1 border-0 bg-transparent p-0 text-sm shadow-none outline-none placeholder:text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxClear,
  ComboboxTrigger,
}
