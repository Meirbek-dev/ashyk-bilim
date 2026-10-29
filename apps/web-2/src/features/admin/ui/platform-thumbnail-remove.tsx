import { m } from '#/paraglide/messages'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'

type PlatformThumbnailRemoveProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  pending: boolean
  error: unknown
}

/** «Убрать обложку» and its confirmation. A refusal shows in the dialog (`error`); a 412 opens the conflict dialog. */
export function PlatformThumbnailRemove({
  open,
  onOpenChange,
  onConfirm,
  pending,
  error,
}: PlatformThumbnailRemoveProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={<Button variant="outline">{m.admin_platform_thumbnail_remove()}</Button>}
      title={m.admin_platform_thumbnail_remove_title()}
      consequence={m.admin_platform_thumbnail_remove_consequence()}
      confirmLabel={m.admin_platform_thumbnail_remove()}
      onConfirm={onConfirm}
      pending={pending}
      error={error}
    />
  )
}
