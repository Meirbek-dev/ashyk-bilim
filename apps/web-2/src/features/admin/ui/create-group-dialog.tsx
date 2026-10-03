import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CreateUsergroupRequest } from '#/shared/api/gen/types.gen'
import { vCreateUsergroupRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { createGroupOptions } from '../queries'

const defaultValues: CreateUsergroupRequest = { name: '', description: '' }

/** "New group": name and description, then the group's page, where members are added. */
export function CreateGroupDialog() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const create = useMutation(createGroupOptions())
  const form = useAppForm(vCreateUsergroupRequest, {
    defaultValues,
    onSubmit: body =>
      create.mutateAsync(
        { body },
        {
          onSuccess: async group => {
            setOpen(false)
            form.reset()
            toast.add({ title: m.admin_group_created() })
            await navigate({ to: '/teach/groups/$groupId', params: { groupId: group.id } })
          },
        },
      ),
  })
  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) {
      form.reset()
      create.reset()
    }
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={changeOpen}
      trigger={<Button>{m.admin_group_new()}</Button>}
      title={m.admin_group_new()}
      submitLabel={m.admin_create_submit()}
      onSubmit={() => form.handleSubmit()}
      pending={create.isPending}
      error={create.error}
    >
      <form.AppField name="name">{field => <field.TextField label={m.admin_field_name()} required />}</form.AppField>
      <form.AppField name="description">
        {field => <field.TextareaField label={m.admin_field_description()} />}
      </form.AppField>
    </FormDialog>
  )
}
