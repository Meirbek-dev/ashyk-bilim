import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Usergroup } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { Link } from '#/shared/components/link'
import { MultiCombobox, type ComboboxOption } from '#/shared/components/multi-combobox'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { toast } from '#/shared/ui/toast'

import { linkableGroupsOptions, linkGroupsOptions } from '../queries'

const option = (group: Usergroup): ComboboxOption => ({ value: group.id, label: group.name })

/**
 * "Link groups": pick from the groups the caller may link courses to (`manage_courses`) and not linked yet. With no
 * such group, the way to make one (`groupPages`: the caller has the «Группы» section; B-CST-50) instead of `list`
 * (the linked groups, whose empty state would only repeat it). The text says «no group you can link», not «no groups»:
 * «Группы» lists a colleague's groups too, which this teacher cannot link.
 */
export function LinkGroups({
  courseId,
  linked,
  groupPages,
  list,
}: {
  courseId: string
  linked: readonly Usergroup[]
  groupPages: boolean
  list: ReactNode
}) {
  const { data: linkable } = useSuspenseQuery(linkableGroupsOptions())
  const link = useMutation(linkGroupsOptions(useQueryClient(), courseId))
  const [picked, setPicked] = useState<ComboboxOption[]>([])
  const choices = linkable.filter(group => !linked.some(old => old.id === group.id))
  if (linkable.length === 0 && linked.length === 0)
    return groupPages ? (
      <p className="text-sm">
        {m.studio_groups_none_yet()} <Link to="/teach/groups">{m.studio_groups_create()}</Link>
      </p>
    ) : (
      list
    )
  if (choices.length === 0 && picked.length === 0) return list
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
    <>
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
        <SubmitButton type="submit" variant="outline" pending={link.isPending} disabled={picked.length === 0}>
          {m.studio_group_link_submit()}
        </SubmitButton>
        {link.error ? <ErrorAlert>{presentError(link.error)}</ErrorAlert> : null}
      </form>
      {list}
    </>
  )
}
