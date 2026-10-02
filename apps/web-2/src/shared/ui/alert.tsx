import type { ReactNode } from 'react'

/** Placeholder until the kit (phase 1): an announced error message. */
export function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  )
}
