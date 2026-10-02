import { useHydrated } from '@tanstack/react-router'
import type { ReactNode } from 'react'

/** A guest form: fields stay disabled until hydration, so typed text reaches the form and nothing submits natively. */
export function AuthForm({ onSubmit, children }: { onSubmit: () => Promise<void>; children: ReactNode }) {
  const hydrated = useHydrated()
  return (
    <form
      method="post"
      noValidate
      className="flex flex-col gap-4"
      onSubmit={event => {
        event.preventDefault()
        void onSubmit()
      }}
    >
      <fieldset disabled={!hydrated} className="flex flex-col gap-4">
        {children}
      </fieldset>
    </form>
  )
}
