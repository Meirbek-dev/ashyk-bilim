import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Usergroup } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { MultiCombobox, type ComboboxOption } from '#/shared/components/multi-combobox'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'
import { toast } from '#/shared/ui/toast'

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
          toast.add({ title: m.studio_group_linked() })
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
        <MultiCombobox
          label={m.studio_group_link()}
          options={choices.map(option)}
          value={picked}
          onValueChange={setPicked}
        />
      </div>
      <Button type="submit" variant="outline" disabled={picked.length === 0 || link.isPending}>
        {link.isPending ? <Spinner data-icon="inline-start" /> : null}
        {m.studio_group_link_submit()}
      </Button>
      {link.error ? <ErrorAlert>{presentError(link.error)}</ErrorAlert> : null}
    </form>
  )
}
