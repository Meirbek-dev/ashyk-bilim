import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { SavedView } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/ui/icon-button'
import { Link } from '#/shared/ui/link'
import { ConfirmDialog } from '#/shared/ui/templates/confirm-dialog'

import { viewTarget } from '../model/analytics'
import { tabPaths } from '../model/filters'
import { deleteViewOptions } from '../queries'

/** One saved view: its link, and delete through the confirmation that names it. */
export function SavedViewItem({ view }: { view: SavedView }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const remove = useMutation(deleteViewOptions(queryClient))
  const { tab, filters } = viewTarget(view)
  const confirm = () =>
    remove.mutate(
      { path: { view_id: view.id } },
      {
        onSuccess: () => {
          setOpen(false)
          toast(m.analytics_view_deleted())
        },
      },
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-md border pl-2">
      <Link to={tabPaths[tab]} search={filters}>
        <span className="wrap-anywhere">{view.name}</span>
      </Link>
      <ConfirmDialog
        open={open}
        onOpenChange={next => {
          setOpen(next)
          if (!next) remove.reset()
        }}
        trigger={<IconButton label={m.analytics_view_delete({ name: view.name })} icon={<Trash2 aria-hidden />} />}
        title={m.analytics_view_delete_title({ name: view.name })}
        consequence={m.analytics_view_delete_consequence()}
        confirmLabel={m.analytics_view_delete_confirm()}
        onConfirm={confirm}
        pending={remove.isPending}
        error={remove.error}
      />
    </span>
  )
}
