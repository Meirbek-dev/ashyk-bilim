import { lazy, Suspense } from 'react'

// Toasts follow a user's action, never the first paint: sonner loads after the entry (budget G-05).
const Sonner = lazy(() => import('sonner').then(module => ({ default: module.Toaster })))

/** Success toasts (DESIGN 8: only from a mutation's onSuccess, the verb in the past tense). Mounted once. */
export function Toaster() {
  return (
    <Suspense fallback={null}>
      <Sonner
        position="bottom-center"
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              'flex w-full items-center gap-2 rounded-lg border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-md',
          },
        }}
      />
    </Suspense>
  )
}
