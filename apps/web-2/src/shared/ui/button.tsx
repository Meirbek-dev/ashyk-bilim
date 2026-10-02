import type { ComponentProps } from 'react'

type ButtonProps = Omit<ComponentProps<'button'>, 'className'> & { variant?: 'primary' | 'quiet' }

const variants = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  quiet: 'text-foreground hover:bg-muted',
}

/** Placeholder until the kit (phase 1): token colors only, type defaults to "button". */
export function Button({ variant = 'primary', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-md px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${variants[variant]}`}
      {...props}
    />
  )
}
