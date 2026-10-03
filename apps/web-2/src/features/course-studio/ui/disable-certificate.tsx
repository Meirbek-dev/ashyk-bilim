import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Certification, Course } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'
import { ConfirmDialog } from '#/shared/ui/templates/confirm-dialog'

import { deleteCertificationOptions } from '../queries'

/** Switch the certificate off: the configuration is deleted after a confirmation. */
export function DisableCertificate({ course, certification }: { course: Course; certification: Certification }) {
  const [open, setOpen] = useState(false)
  const remove = useMutation(deleteCertificationOptions(useQueryClient(), course.id))
  const confirm = () =>
    remove.mutate(
      { path: { id: certification.id } },
      {
        onSuccess: () => {
          setOpen(false)
          toast(m.studio_certificate_disabled())
        },
      },
    )
  return (
    <div>
      <ConfirmDialog
        open={open}
        onOpenChange={next => {
          setOpen(next)
          if (!next) remove.reset()
        }}
        trigger={<Button variant="outline">{m.studio_certificate_disable()}</Button>}
        title={m.studio_certificate_disable_title({ name: course.name })}
        consequence={m.studio_certificate_disable_consequence()}
        confirmLabel={m.studio_certificate_disable()}
        onConfirm={confirm}
        pending={remove.isPending}
        error={remove.error}
      />
    </div>
  )
}
