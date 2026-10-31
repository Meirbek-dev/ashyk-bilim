import type { ErrorComponentProps } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import { ErrorAlert } from '#/shared/components/error-alert'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'

/** The class map could not load (B-CON-09): with the feature off a quiet line, otherwise the error and «Retry». */
export function ClassMapError({ error, reset }: ErrorComponentProps) {
  if (error instanceof ApiError && error.code === 'ai-disabled')
    return <p className="text-sm text-muted-foreground">{m.concepts_class_off()}</p>
  return (
    <div className="flex flex-col items-start gap-2">
      <ErrorAlert>{presentError(error)}</ErrorAlert>
      <Button variant="outline" size="sm" onClick={reset}>
        {m.ui_retry()}
      </Button>
    </div>
  )
}
