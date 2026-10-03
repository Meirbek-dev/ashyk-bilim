import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { vSaveViewRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import type { Filters, Tab } from '../model/filters'
import { saveViewOptions } from '../queries'

/** "Save view": a name for the current tab and filters (the same name on the same tab overwrites it). */
export function SaveViewDialog({ tab, filters }: { tab: Tab; filters: Filters }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const save = useMutation(saveViewOptions(queryClient))
  const form = useAppForm(vSaveViewRequest, {
    defaultValues: { name: '' },
    onSubmit: ({ name }) =>
      save.mutateAsync(
        { body: { name, view_type: tab, query: filters } },
        {
          onSuccess: () => {
            setOpen(false)
            form.reset()
            toast.add({ title: m.analytics_view_saved() })
          },
        },
      ),
  })
  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) {
      form.reset()
      save.reset()
    }
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={changeOpen}
      trigger={<Button>{m.analytics_view_save()}</Button>}
      title={m.analytics_view_save()}
      submitLabel={m.ui_save()}
      onSubmit={() => form.handleSubmit()}
      pending={save.isPending}
      error={save.error}
    >
      <form.AppField name="name">{field => <field.TextField label={m.analytics_view_name()} required />}</form.AppField>
    </FormDialog>
  )
}
