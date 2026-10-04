import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Copy, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentItem } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { toast } from '#/shared/ui/toast'

import { copyItem } from '../model/items'
import { createItemOptions, deleteItemOptions } from '../queries'
import { useVersion } from './use-version'

type ItemActionsProps = { activityId: string; assessmentId: string; item: AssessmentItem }

/** Duplicate (the copy is appended and opened) and delete (asks first) of the open question. */
export function ItemActions({ activityId, assessmentId, item }: ItemActionsProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const duplicate = useMutation(createItemOptions(queryClient, activityId, assessmentId))
  const remove = useMutation(deleteItemOptions(queryClient, activityId, assessmentId))
  const version = useVersion(activityId)
  const [confirming, setConfirming] = useState(false)
  const title = item.title || m.assessments_item_untitled()
  const open = (id: string | undefined) =>
    navigate({ to: '.', search: previous => ({ ...previous, item: id }), replace: true })

  const copy = () =>
    duplicate.mutate(
      {
        path: { assessment_id: assessmentId },
        body: copyItem(item, m.assessments_item_copy_title({ title })),
        headers: version.headers(),
      },
      {
        onSuccess: created => {
          toast.add({ title: m.assessments_item_duplicated() })
          void open(created.id)
        },
      },
    )
  const confirm = () =>
    remove.mutate(
      { path: { item_id: item.id }, headers: { ...version.headers(), Prefer: 'return=representation' } },
      {
        onSuccess: () => {
          setConfirming(false)
          toast.add({ title: m.assessments_item_deleted() })
          void open(undefined)
        },
      },
    )
  return (
    <div className="flex items-center gap-1">
      <IconButton
        label={m.assessments_item_duplicate()}
        icon={<Copy aria-hidden />}
        disabled={duplicate.isPending}
        onClick={copy}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={next => {
          setConfirming(next)
          if (!next) remove.reset()
        }}
        trigger={<IconButton label={m.assessments_item_delete()} icon={<Trash2 aria-hidden />} />}
        title={m.assessments_item_delete_title({ title })}
        consequence={m.assessments_item_delete_consequence()}
        confirmLabel={m.assessments_delete()}
        onConfirm={confirm}
        pending={remove.isPending}
        error={remove.error}
      />
    </div>
  )
}
