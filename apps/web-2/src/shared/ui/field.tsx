'use client'

import type * as React from 'react'
import { useMemo } from 'react'
import {
  Field as FieldPrimitive,
  FieldDescription as FieldDescriptionPrimitive,
  FieldError as FieldErrorPrimitive,
  FieldGroup as FieldGroupPrimitive,
  FieldLabel as FieldLabelPrimitive,
  FieldLegend as FieldLegendPrimitive,
  FieldSet as FieldSetPrimitive,
} from '@ui-sdk/react/field'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'

type Classed<P> = Omit<P, 'className'> & { className?: string }

function FieldSet({ className, ...props }: Classed<React.ComponentProps<typeof FieldSetPrimitive>>) {
  return (
    <FieldSetPrimitive
      className={cn(
        'flex flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3',
        className,
      )}
      {...props}
    />
  )
}

function FieldLegend({
  className,
  variant = 'legend',
  ...props
}: Classed<React.ComponentProps<typeof FieldLegendPrimitive>> & {
  variant?: 'legend' | 'label'
}) {
  return (
    <FieldLegendPrimitive
      data-variant={variant}
      className={cn(
        'mb-1.5 font-medium text-inherit data-[variant=label]:text-sm data-[variant=legend]:text-base',
        className,
      )}
      {...props}
    />
  )
}

function FieldGroup({ className, ...props }: Classed<React.ComponentProps<typeof FieldGroupPrimitive>>) {
  return (
    <FieldGroupPrimitive
      className={cn(
        'group/field-group @container/field-group mt-0 flex w-full flex-col gap-5 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4',
        className,
      )}
      {...props}
    />
  )
}

const fieldVariants = cva('group/field flex w-full gap-2 data-invalid:text-destructive', {
  variants: {
    orientation: {
      vertical: 'flex-col *:w-full [&>.sr-only]:w-auto',
      horizontal:
        'flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
      responsive:
        'flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
    },
  },
  defaultVariants: {
    orientation: 'vertical',
  },
})

function Field({
  className,
  orientation = 'vertical',
  ...props
}: Classed<React.ComponentProps<typeof FieldPrimitive>> & VariantProps<typeof fieldVariants>) {
  return (
    <FieldPrimitive
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  )
}

function FieldContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-content"
      className={cn('group/field-content flex flex-1 flex-col gap-0.5 leading-snug', className)}
      {...props}
    />
  )
}

function FieldLabel({ className, ...props }: Classed<React.ComponentProps<typeof FieldLabelPrimitive>>) {
  return (
    <FieldLabelPrimitive
      className={cn(
        'group/field-label peer/field-label flex w-fit items-center gap-2 text-sm leading-snug font-medium text-inherit select-none group-data-disabled/field:opacity-50 has-data-checked:border-primary/30 has-data-checked:bg-primary/5 has-[>[data-slot=field]]:rounded-lg has-[>[data-slot=field]]:border has-[>[data-slot=field]]:not-has-[:disabled,[data-disabled]]:hover:bg-muted/50 has-[>[data-slot=field]]:has-[:focus-visible]:border-ring has-[>[data-slot=field]]:has-[:focus-visible]:ring-3 has-[>[data-slot=field]]:has-[:focus-visible]:ring-ring/50 *:data-[slot=field]:p-2.5',
        'has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col',
        className,
      )}
      {...props}
    />
  )
}

function FieldTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-title"
      className={cn(
        'flex w-fit items-center gap-2 text-sm font-medium group-data-disabled/field:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: Classed<React.ComponentProps<typeof FieldDescriptionPrimitive>>) {
  return (
    <FieldDescriptionPrimitive
      className={cn(
        'text-left text-sm leading-normal font-normal text-muted-foreground group-data-[orientation=horizontal]/field:text-balance [[data-variant=legend]+&]:-mt-1.5',
        'last:mt-0 nth-last-2:-mt-1',
        '[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
        className,
      )}
      {...props}
    />
  )
}

// Shown whenever it has text: the form decides validity, so the browser's own message never shows here.
function FieldError({
  className,
  children,
  errors,
  ...props
}: Classed<Omit<React.ComponentProps<typeof FieldErrorPrimitive>, 'children' | 'match'>> & {
  children?: React.ReactNode
  errors?: Array<{ message?: string } | undefined>
}) {
  const content = useMemo(() => {
    if (children) {
      return children
    }

    if (!errors?.length) {
      return null
    }

    const uniqueErrors = [...new Map(errors.map(error => [error?.message, error])).values()]

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map(error => error?.message && <li key={error.message}>{error.message}</li>)}
      </ul>
    )
  }, [children, errors])

  if (!content) {
    return null
  }

  return (
    <FieldErrorPrimitive match className={cn('text-sm font-normal text-destructive', className)} {...props}>
      {content}
    </FieldErrorPrimitive>
  )
}

export { Field, FieldLabel, FieldDescription, FieldError, FieldGroup, FieldLegend, FieldSet, FieldContent, FieldTitle }
