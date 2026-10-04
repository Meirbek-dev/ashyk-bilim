import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { StudentOverride } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { formatDateTime, formatNumber } from '#/shared/i18n/format'
import { toast } from '#/shared/ui/toast'

import { deleteOverrideOptions } from '../queries'
import { OverrideDialog } from './override-dialog'

type OverrideRowProps = { assessmentId: string; row: StudentOverride; name: string; editable: boolean }

/** One learner's exception: the terms that differ from the rules, with change and remove. */
export function OverrideRow({ assessmentId, row, name, editable }: OverrideRowProps) {
  const remove = useMutation(deleteOverrideOptions(useQueryClient(), assessmentId))
  const [confirming, setConfirming] = useState(false)
  const terms = [
    row.max_attempts_override === null
      ? null
      : m.assessments_exception_attempts({ count: formatNumber(row.max_attempts_override) }),
    row.due_at_override_unix === null
      ? null
      : m.assessments_exception_due({ date: formatDateTime(row.due_at_override_unix) }),
    row.waive_late_penalty ? m.assessments_exception_waived() : null,
  ].filter(term => term !== null)
  return (
    <li className="flex flex-wrap items-start gap-2 border-b py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium wrap-anywhere">{name}</span>
        <span className="text-sm text-muted-foreground">{terms.join(' · ')}</span>
        {row.note ? <span className="text-sm wrap-anywhere">{row.note}</span> : null}
      </div>
      {editable ? (
        <>
          <OverrideDialog
            assessmentId={assessmentId}
            row={row}
            learners={[]}
            trigger={<IconButton label={m.assessments_exception_edit({ name })} icon={<Pencil aria-hidden />} />}
          />
          <ConfirmDialog
            open={confirming}
            onOpenChange={next => {
              setConfirming(next)
              if (!next) remove.reset()
            }}
            trigger={<IconButton label={m.assessments_exception_remove({ name })} icon={<Trash2 aria-hidden />} />}
            title={m.assessments_exception_remove_title({ name })}
            consequence={m.assessments_exception_remove_consequence()}
            confirmLabel={m.assessments_exception_remove_confirm()}
            onConfirm={() =>
              remove.mutate(
                { path: { assessment_id: assessmentId, user_id: row.user_id } },
                { onSuccess: () => toast.add({ title: m.assessments_exception_removed() }) },
              )
            }
            pending={remove.isPending}
            error={remove.error}
          />
        </>
      ) : null}
    </li>
  )
}
