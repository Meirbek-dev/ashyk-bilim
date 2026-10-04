import type { ErrorComponentProps } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { ErrorAlert } from '#/shared/components/error-alert'
import { Button } from '#/shared/ui/button'

/** The panel could not load: the page around it stays usable. */
export function PanelError({ reset }: ErrorComponentProps) {
  return (
    <div className="flex flex-col items-start gap-2">
      <ErrorAlert>{m.ai_panel_error()}</ErrorAlert>
      <Button variant="outline" size="sm" onClick={reset}>
        {m.ui_retry()}
      </Button>
    </div>
  )
}
