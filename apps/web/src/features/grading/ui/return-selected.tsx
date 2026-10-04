import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { formatNumber } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { type QueueRow, returnable } from '../model/queue'
import { returnManyOptions } from '../mutations'
import type { Work } from '../queries'

type ReturnSelectedProps = { work: Work; courseId: CourseId; rows: readonly QueueRow[]; onDone: () => void }

/** "Return for revision" for the selected rows the server lets go back (B-GRD-08); skipped rows are counted. */
export function ReturnSelected({ work, courseId, rows, onDone }: ReturnSelectedProps) {
  const [open, setOpen] = useState(false)
  const back = useMutation(returnManyOptions(work, courseId))
  const targets = returnable(rows)
  const skipped = back.data?.skipped_count ?? 0
  return (
    <>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        trigger={
          <Button variant="outline" disabled={targets.length === 0}>
            {m.grading_return_selected()}
          </Button>
        }
        title={m.grading_return_title()}
        consequence={m.grading_return_text({ count: formatNumber(targets.length) })}
        confirmLabel={m.grading_return()}
        pending={back.isPending}
        error={back.error}
        onConfirm={() =>
          back.mutate(targets, {
            onSuccess: result => {
              setOpen(false)
              if (result.done_count > 0)
                toast.add({ title: m.grading_return_done({ count: formatNumber(result.done_count) }) })
              onDone()
            },
          })
        }
      />
      {skipped > 0 ? <ErrorAlert>{m.grading_return_skipped({ count: formatNumber(skipped) })}</ErrorAlert> : null}
    </>
  )
}
