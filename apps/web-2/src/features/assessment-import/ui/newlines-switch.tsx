import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentImport } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { describedBy, FieldShell } from '#/shared/components/form/field-shell'
import { presentError } from '#/shared/i18n/errors'
import { Spinner } from '#/shared/ui/spinner'
import { Switch } from '#/shared/ui/switch'

import { NEWLINE_TOKEN } from '../model/issues'
import { keepImport, reparseImportOptions } from '../queries'

/** «Не преобразовывать \n»: the same file read again with DOT's `\n` left as typed (or back). */
export function NewlinesSwitch({ imported }: { imported: AssessmentImport }) {
  const queryClient = useQueryClient()
  const reparse = useMutation(reparseImportOptions())
  const id = useId()
  const description = m.assessment_import_newlines_hint({ token: NEWLINE_TOKEN })
  const toggle = (keep: boolean) => {
    // One re-read at a time; the switch shows the file as the server last read it.
    if (reparse.isPending) return
    reparse.mutate(
      { path: { import_id: imported.id }, body: { unescape_newlines: !keep } },
      { onSuccess: next => keepImport(queryClient, next) },
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <FieldShell
          inline
          id={id}
          label={m.assessment_import_field_newlines({ token: NEWLINE_TOKEN })}
          description={description}
        >
          <Switch
            id={id}
            checked={!imported.unescape_newlines}
            onCheckedChange={toggle}
            aria-busy={reparse.isPending || undefined}
            aria-describedby={describedBy(id, description, undefined)}
          />
        </FieldShell>
        {reparse.isPending ? <Spinner aria-hidden /> : null}
      </div>
      {reparse.error ? <ErrorAlert>{presentError(reparse.error)}</ErrorAlert> : null}
    </div>
  )
}
