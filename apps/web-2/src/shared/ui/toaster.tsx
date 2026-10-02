import { Toaster as Sonner } from 'sonner'

/** Success toasts (DESIGN 8: only from a mutation's onSuccess, the verb in the past tense). Mounted once. */
export function Toaster() {
  return (
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
  )
}
