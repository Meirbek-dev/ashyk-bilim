'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { linkUserToUserGroup, unLinkUserToUserGroup } from '@services/usergroups/usergroups'
import { useAllMembers } from '@/features/users/hooks/useUsers'
import { userGroupUsersQueryOptions } from '@/features/users/queries/users.query'
import { useApiError } from '@/hooks/useApiError'
import { queryKeys } from '@/lib/react-query/queryKeys'
import type { AdminUser } from '@/lib/api/generated/zod'
import DataTable from '@components/ui/data-table'
import type { DataTableColumnDef } from '@components/ui/data-table'
import { Check, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

interface ManageUsersProps {
  usergroup_id: string
}

function ManageUsers(props: ManageUsersProps) {
  const t = useTranslations('Components.ManageUsers')
  const queryClient = useQueryClient()
  const { handleApiError } = useApiError()
  const { data: users = [] } = useAllMembers()
  const userGroupUsersKey = queryKeys.userGroups.users(props.usergroup_id)
  const { data: members = [] } = useQuery(userGroupUsersQueryOptions(props.usergroup_id))

  const isUserPartOfGroup = (user_id: string) => members.some(member => member.id === user_id)

  const handleLinkUser = async (user_id: string) => {
    try {
      await linkUserToUserGroup(props.usergroup_id, user_id)
      toast.success(t('linkSuccess'))
      await queryClient.invalidateQueries({ queryKey: userGroupUsersKey })
    } catch (error) {
      toast.error(t('linkError', { error: handleApiError(error, { fallback: t('unknownError') }).message }))
    }
  }

  const handleUnlinkUser = async (user_id: string) => {
    try {
      await unLinkUserToUserGroup(props.usergroup_id, user_id)
      toast.success(t('unlinkSuccess'))
      await queryClient.invalidateQueries({ queryKey: userGroupUsersKey })
    } catch (error) {
      toast.error(t('unlinkError', { error: handleApiError(error, { fallback: t('unknownError') }).message }))
    }
  }

  const columns: DataTableColumnDef<AdminUser>[] = [
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
      accessorFn: row => (isUserPartOfGroup(row.id) ? t('linkedStatus') : t('notLinkedStatus')),
      id: 'linked',
      header: t('linkedHeader'),
      cell: ({ row }) =>
        isUserPartOfGroup(row.original.id) ? (
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
      cell: ({ row }) => (
        <div className="flex items-end space-x-2">
          <Button
            type="button"
            onClick={() => handleLinkUser(row.original.id)}
            variant="ghost"
            className="flex items-center space-x-2 rounded-md bg-cyan-700 p-1 px-3 text-sm font-bold text-cyan-100 hover:cursor-pointer hover:bg-cyan-800"
          >
            <Plus className="h-4 w-4" />
            <span>{t('linkButton')}</span>
          </Button>
          <Button
            type="button"
            onClick={() => handleUnlinkUser(row.original.id)}
            variant="ghost"
            className="flex items-center space-x-2 rounded-md bg-gray-700 p-1 px-3 text-sm font-bold text-gray-100 hover:cursor-pointer hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
            <span>{t('unlinkButton')}</span>
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="py-3">
      <DataTable columns={columns} data={users} pageSize={8} storageKey={`usergroup-${props.usergroup_id}-users`} />
    </div>
  )
}

export default ManageUsers
