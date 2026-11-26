import type * as React from 'react'
import { Button as ButtonPrimitive } from '@ui-sdk/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'

import { m } from '#/paraglide/messages'
import { reportClientError } from '#/shared/lib/client-errors'

// web.css paints every button slot (background, color, padding, icon width): each variant and size sets its own.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none data-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-highlight text-highlight-foreground shadow-button hover:bg-[color-mix(in_oklab,var(--highlight),black_10%)] active:bg-[color-mix(in_oklab,var(--highlight),black_16%)]',
        outline:
          'border-control-border bg-card text-inherit shadow-control hover:border-[color-mix(in_oklab,var(--input),var(--background)_20%)] hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'bg-transparent text-inherit hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20',
        link: 'bg-transparent text-link underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-control w-auto gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        xs: "h-7 w-auto gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 w-auto gap-1.5 rounded-md px-3 text-sm in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-12 w-auto gap-2 px-6 text-base has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5',
        icon: 'size-control p-0',
        'icon-xs':
          "size-7 rounded-[min(var(--radius-md),10px)] p-0 in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-9 rounded-md p-0 in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-11 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonProps = Omit<React.ComponentProps<typeof ButtonPrimitive>, 'className'> &
  VariantProps<typeof buttonVariants> & { className?: string }

// ui-sdk catches what a click handler throws or rejects with and only logs it: report it the way window errors are.
function reported(onClick: ButtonProps['onClick']): ButtonProps['onClick'] {
  if (!onClick) return undefined
  return (event, details) => {
    try {
      const result = onClick(event, details)
      return result instanceof Promise
        ? result.catch((error: unknown) => {
            reportClientError('unhandledrejection', error)
            throw error
          })
        : result
    } catch (error) {
      reportClientError('error', error)
      throw error
    }
  }
}

function Button({ className, variant = 'default', size = 'default', onClick, ...props }: ButtonProps) {
  return (
    <ButtonPrimitive
      pendingAnnouncement={m.ui_loading()}
      className={cn(buttonVariants({ variant, size, className }))}
      onClick={reported(onClick)}
      {...props}
    />
  )
}

export { Button, buttonVariants }
