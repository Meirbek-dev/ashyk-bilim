'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { linkUserToUserGroup, unLinkUserToUserGroup } from '@services/usergroups/usergroups'
import { userGroupUsersQueryOptions } from '@/features/users/queries/users.query'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { useApiError } from '@/hooks/useApiError'
import { search } from '@/lib/api/generated/search/search'
import { queryKeys } from '@/lib/react-query/queryKeys'
import type { UsergroupMember } from '@/lib/api/generated/zod'
import DataTable from '@components/ui/data-table'
import type { DataTableColumnDef } from '@components/ui/data-table'
import { Check, Loader2, Plus, Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ManageUsersProps {
  usergroup_id: string
}

type PickerRow = Pick<UsergroupMember, 'id' | 'username' | 'display_name'>

const MIN_QUERY = 2

/**
 * Rows = current members ∪ people matching the search. The admin directory
 * (`GET /users`) needs `platform:read:platform`, which instructors lack; the
 * platform search's people section is open to every signed-in caller.
 */
function ManageUsers(props: ManageUsersProps) {
  const t = useTranslations('Components.ManageUsers')
  const queryClient = useQueryClient()
  const { handleApiError } = useApiError()
  const [term, setTerm] = useState('')
  const query = useDebouncedValue(term.trim(), 300)
  const userGroupUsersKey = queryKeys.userGroups.users(props.usergroup_id)
  const { data: members = [] } = useQuery(userGroupUsersQueryOptions(props.usergroup_id))
  const hits = useQuery({
    queryKey: queryKeys.search.people(query),
    queryFn: () => search({ q: query, limit: 50 }),
    enabled: query.length >= MIN_QUERY,
    select: results => results.users,
  })

  const memberIds = useMemo(() => new Set(members.map(member => member.id)), [members])
  const rows = useMemo<PickerRow[]>(() => {
    const found = (hits.data ?? []).filter(user => !memberIds.has(user.id))
    return [...members, ...found]
  }, [hits.data, memberIds, members])

  const membership = useMutation({
    mutationFn: ({ userId, link }: { userId: string; link: boolean }) =>
      link ? linkUserToUserGroup(props.usergroup_id, userId) : unLinkUserToUserGroup(props.usergroup_id, userId),
    onSuccess: async (_data, { link }) => {
      toast.success(link ? t('linkSuccess') : t('unlinkSuccess'))
      await queryClient.invalidateQueries({ queryKey: userGroupUsersKey })
    },
    onError: (error, { link }) => {
      const message = handleApiError(error, { fallback: t('unknownError') }).message
      toast.error(link ? t('linkError', { error: message }) : t('unlinkError', { error: message }))
    },
  })

  const columns: DataTableColumnDef<PickerRow>[] = [
    {
      accessorFn: row => `${row.display_name} ${row.username}`,
      id: 'user',
      header: t('userHeader'),
      cell: ({ row }) => (
        <div className="flex items-center space-x-2">
          <span>{row.original.display_name}</span>
          <span className="rounded-full bg-neutral-100 p-1 px-2 text-xs font-semibold text-neutral-400">
            @{row.original.username}
          </span>
        </div>
      ),
    },
    {
      accessorFn: row => (memberIds.has(row.id) ? t('linkedStatus') : t('notLinkedStatus')),
      id: 'linked',
      header: t('linkedHeader'),
      cell: ({ row }) =>
        memberIds.has(row.original.id) ? (
          <div className="flex w-fit items-center space-x-1 rounded-full bg-cyan-100 px-4 py-1 text-cyan-800">
            <Check size={16} />
            <span>{t('linkedStatus')}</span>
          </div>
        ) : (
          <div className="flex w-fit items-center space-x-1 rounded-full bg-gray-100 px-4 py-1 text-gray-800">
            <X size={16} />
            <span>{t('notLinkedStatus')}</span>
          </div>
        ),
    },
    {
      id: 'actions',
      header: t('actionsHeader'),
      enableSorting: false,
      cell: ({ row }) => {
        const isMember = memberIds.has(row.original.id)
        const pending = membership.isPending && membership.variables?.userId === row.original.id
        return isMember ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => membership.mutate({ userId: row.original.id, link: false })}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
            <span>{t('unlinkButton')}</span>
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => membership.mutate({ userId: row.original.id, link: true })}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            <span>{t('linkButton')}</span>
          </Button>
        )
      },
    },
  ]

  return (
    <div className="space-y-3 py-3">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          type="search"
          className="pl-8"
          value={term}
          onChange={event => setTerm(event.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {hits.isFetching ? t('searching') : query.length >= MIN_QUERY ? t('searchHint') : t('searchIdleHint')}
      </p>
      <DataTable columns={columns} data={rows} pageSize={8} storageKey={`usergroup-${props.usergroup_id}-users`} />
    </div>
  )
}

export default ManageUsers
