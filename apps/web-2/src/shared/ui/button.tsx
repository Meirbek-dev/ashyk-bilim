import { Button as BaseButton } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { LoaderCircle } from 'lucide-react'
import type { ComponentProps } from 'react'

/** Shared with the kit Link, so a navigation that looks like a button is still a link. */
export const buttonVariants = cva(
  'inline-flex h-control shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        destructive: 'border-destructive/40 text-destructive hover:bg-destructive/10',
      },
      size: {
        default: 'px-4',
        icon: 'w-control',
        block: 'w-full px-4',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
)

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, 'className' | 'render' | 'nativeButton'> &
  VariantProps<typeof buttonVariants> & {
    /** A mutation is running: the button is disabled and shows the pending indicator. */
    pending?: boolean
  }

/** One primary per view (DESIGN 8); `type` defaults to "button" so nothing submits by accident. */
export function Button({ variant, size, pending = false, type = 'button', disabled, children, ...props }: ButtonProps) {
  return (
    <BaseButton
      type={type}
      disabled={disabled === true || pending}
      aria-busy={pending || undefined}
      className={buttonVariants({ variant, size })}
      {...props}
    >
      {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
      {children}
    </BaseButton>
  )
}
