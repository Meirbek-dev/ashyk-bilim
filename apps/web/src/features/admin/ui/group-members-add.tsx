import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Suspense, useState, type FormEvent } from 'react'

import { m } from '#/paraglide/messages'
import type { Usergroup, UserHit } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Skeleton } from '#/shared/ui/skeleton'
import { Spinner } from '#/shared/ui/spinner'
import { toast } from '#/shared/ui/toast'

import { addMembersOptions } from '../group-queries'
import { PeoplePicker } from './people-picker'

/** "Add members" of the group page (`manage_members`): people picked by search, added in one request. */
export function GroupMembersAdd({ group }: { group: Usergroup }) {
  const add = useMutation(addMembersOptions(useQueryClient()))
  const [picked, setPicked] = useState<UserHit[]>([])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    add.mutate(
      { group: group.id, members: picked },
      {
        onSuccess: () => {
          setPicked([])
          toast.add({ title: m.admin_group_members_added() })
        },
      },
    )
  }
  return (
    <form noValidate className="flex max-w-prose flex-col items-start gap-2" onSubmit={submit}>
      <div className="w-full">
        <Suspense fallback={<Skeleton className="h-row w-full" />}>
          <PeoplePicker label={m.admin_group_members_add()} value={picked} onValueChange={setPicked} />
        </Suspense>
      </div>
      <Button type="submit" variant="outline" disabled={picked.length === 0 || add.isPending}>
        {add.isPending ? <Spinner data-icon="inline-start" /> : null}
        {m.admin_add()}
      </Button>
      {add.error ? <ErrorAlert>{presentError(add.error)}</ErrorAlert> : null}
    </form>
  )
}
