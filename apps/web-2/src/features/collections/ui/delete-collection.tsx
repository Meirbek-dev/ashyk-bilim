import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Collection } from '#/shared/api/gen/types.gen'
import { collectionActionLabels } from '#/shared/i18n/labels'
import { Button } from '#/shared/ui/button'
import { ConfirmDialog } from '#/shared/ui/templates/confirm-dialog'

import { deleteCollectionOptions } from '../queries'

/** Delete through the confirmation that names the collection; then the list without it. */
export function DeleteCollection({ collection }: { collection: Collection }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const remove = useMutation(deleteCollectionOptions())
  const confirm = () =>
    remove.mutate(
      { path: { collection_id: collection.id }, headers: { 'If-Match': collection.version } },
      {
        onSuccess: async () => {
          setOpen(false)
          toast(m.collections_deleted())
          await navigate({ to: '/collections' })
        },
      },
    )
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) remove.reset()
      }}
      trigger={<Button variant="outline">{collectionActionLabels.delete()}</Button>}
      title={m.collections_delete_title({ name: collection.name })}
      consequence={m.collections_delete_consequence()}
      confirmLabel={collectionActionLabels.delete()}
      onConfirm={confirm}
      pending={remove.isPending}
      error={remove.error}
    />
  )
}
