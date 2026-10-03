import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Usergroup } from '#/shared/api/gen/types.gen'
import { presentError } from '#/shared/i18n/errors'
import { Alert } from '#/shared/ui/alert'
import { Button } from '#/shared/ui/button'
import { Combobox, type ComboboxOption } from '#/shared/ui/combobox'

import { linkableGroupsOptions, linkGroupsOptions } from '../queries'

const option = (group: Usergroup): ComboboxOption => ({ value: group.id, label: group.name })

/** "Link groups": pick from the groups the caller may link courses to (`manage_courses`) and not linked yet. */
export function LinkGroups({ courseId, linked }: { courseId: string; linked: readonly Usergroup[] }) {
  const { data: linkable } = useSuspenseQuery(linkableGroupsOptions())
  const link = useMutation(linkGroupsOptions(useQueryClient(), courseId))
  const [picked, setPicked] = useState<ComboboxOption[]>([])
  const choices = linkable.filter(group => !linked.some(old => old.id === group.id))
  if (choices.length === 0 && picked.length === 0) return null
  const submit = () =>
    link.mutate(
      choices.filter(group => picked.some(chosen => chosen.value === group.id)),
      {
        onSuccess: () => {
          setPicked([])
          toast(m.studio_group_linked())
        },
      },
    )
  return (
    <form
      noValidate
      className="flex flex-col items-start gap-2"
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="w-full">
        <Combobox
          label={m.studio_group_link()}
          options={choices.map(option)}
          value={picked}
          onValueChange={setPicked}
        />
      </div>
      <Button type="submit" variant="outline" pending={link.isPending} disabled={picked.length === 0}>
        {m.studio_group_link_submit()}
      </Button>
      {link.error ? <Alert>{presentError(link.error)}</Alert> : null}
    </form>
  )
}
