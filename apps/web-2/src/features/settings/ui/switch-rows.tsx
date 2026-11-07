import type { ReactNode } from 'react'

/**
 * Switches as a ruled list, the way a form is printed: the question on the left, the answer at the end of its line. The
 * fields are the stock SwitchField; only their order on the line changes here, and the switch is the one focus stop.
 */
export function SwitchRows({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col divide-y border-y [&_[data-slot=field-label]]:font-normal [&>[data-slot=field]]:flex-row-reverse [&>[data-slot=field]]:justify-between [&>[data-slot=field]]:gap-6 [&>[data-slot=field]]:py-3.5">
      {children}
    </div>
  )
}
