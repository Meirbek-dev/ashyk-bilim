'use client'

import { AUTH_PERMISSION_WILDCARD } from '@/lib/auth/types'

import { useQueryClient } from '@tanstack/react-query'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Actions, Resources, Scopes } from '@/components/Security'
import RolesUpdate from '@/components/Objects/Modals/Dash/Users/RolesUpdate'
import { useSession } from '@/hooks/useSession'
import { useAllMembers, useRoles } from '@/features/users/hooks/useUsers'
import { accountLabel, useRoleLabels } from '@/features/users/hooks/useRoleLabels'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import type { AdminUser } from '@/lib/api/generated/zod'
import DataTable from '@/components/ui/data-table'
import type { DataTableColumnDef } from '@/components/ui/data-table'

import { AlertTriangle, KeyRound, Loader2, UserRoundCheck, UserRoundX } from 'lucide-react'
import Modal from '@/components/Objects/Elements/Modal/Modal'
import { setUserStatus } from '@/services/rbac'
import { useApiError } from '@/hooks/useApiError'
import { allMembersQueryOptions } from '@/features/users/queries/users.query'
import React, { useState, useTransition, useSyncExternalStore } from 'react'

const emptySubscribe = () => () => {}
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

const USERS_PER_PAGE = 20

interface RemoveUserButtonProps {
  userId: string
  name: string
  onRemove: (userId: string) => Promise<void>
  t: (key: string, values?: Record<string, string>) => string
}

type UserRow = AdminUser

function RemoveUserButton({ userId, name, onRemove, t }: RemoveUserButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleRemove() {
    startTransition(async () => {
      await onRemove(userId)
      setIsOpen(false)
    })
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger
        render={
          <Button type="button" variant="destructive" size="sm">
            <UserRoundX className="size-3.5" />
            {t('removeFromOrgButton')}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <AlertTriangle className="text-destructive size-6" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t('removeUserModalTitle', { name })}</AlertDialogTitle>
          <AlertDialogDescription>{t('removeUserModalMessage')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} />
          <AlertDialogAction variant="destructive" onClick={handleRemove} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t('removeUserButton')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function Users() {
  const { session: sessionData, user: currentUser, can } = useSession()
  const t = useTranslations('DashPage.UserSettings.usersSection')
  const tErrors = useTranslations('Errors')
  const canUpdateRole = can(Resources.ROLE, Actions.UPDATE, Scopes.APP)
  const canDeleteUser = can(Resources.USER, Actions.DELETE, Scopes.APP)

  const { data: roles } = useRoles()
  const rolePriority = React.useCallback(
    (slugs: readonly string[] | undefined) =>
      Math.max(0, ...(slugs ?? []).map(slug => roles?.find(role => role.slug === slug)?.priority ?? 0)),
    [roles],
  )
  const { roleName: roleLabel } = useRoleLabels(roles)
  const currentUserPriority = rolePriority(sessionData?.roles)
  const isAdminUser = sessionData?.permissions.includes(AUTH_PERMISSION_WILDCARD) ?? false

  const queryClient = useQueryClient()
  const { toastApiError } = useApiError()
  const { data: users = [], isLoading, isError, error } = useAllMembers()
  const isForbidden = isError && hasErrorCode(error, 'forbidden')
  const hasMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )

  const [rolesModal, setRolesModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)

  const handleRolesModal = React.useCallback((user: UserRow) => {
    setSelectedUser(user)
    setRolesModal(true)
  }, [])

  const handleCloseRolesModal = React.useCallback(() => {
    setSelectedUser(null)
    setRolesModal(false)
  }, [])

  // v2 has no hard user delete (DECISIONS.md 2026-09-13): the control disables the account; a disabled row offers «Включить».
  const handleSetDisabled = React.useCallback(
    async (user_id: string, disabled: boolean) => {
      const toastId = toast.loading(t(disabled ? 'removingUser' : 'enablingUser'))
      try {
        await setUserStatus(user_id, { disabled })
        await queryClient.invalidateQueries({ queryKey: allMembersQueryOptions().queryKey })
        toast.success(t(disabled ? 'userRemovedSuccess' : 'userEnabledSuccess'), { id: toastId })
      } catch (statusError) {
        toastApiError(statusError, { toastId })
      }
    },
    [queryClient, t, toastApiError],
  )
  const handleRemoveUser = React.useCallback((user_id: string) => handleSetDisabled(user_id, true), [handleSetDisabled])
  const columns = React.useMemo<DataTableColumnDef<UserRow>[]>(
    () => [
      {
        accessorFn: row => `${row.display_name} ${row.username} ${row.email}`,
        id: 'user',
        header: t('userHeader'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.display_name && <span className="font-medium">{row.original.display_name}</span>}
            <Badge variant="outline" className="font-mono text-xs">
              @{row.original.username}
            </Badge>
            {row.original.status === 'disabled' && <Badge variant="secondary">{t('statusDisabled')}</Badge>}
          </div>
        ),
      },
      {
        accessorFn: row => row.roles.join(' '),
        id: 'role',
        header: t('roleHeader'),
        cell: ({ row }) =>
          row.original.roles.map(slug => (
            <Badge key={slug} variant="secondary" className="mr-1">
              {roleLabel(slug)}
            </Badge>
          )),
      },
      {
        id: 'actions',
        header: t('actionsHeader'),
        enableSorting: false,
        cell: ({ row }) => {
          const user = row.original
          const isSelf = currentUser?.id === user.id
          const targetPriority = rolePriority(user.roles)
          const canManage = !isSelf && (isAdminUser || currentUserPriority > targetPriority)

          if (isSelf) return <span className="text-muted-foreground text-xs">{t('cannotEditSelf')}</span>
          if (!canManage) {
            return <span className="text-muted-foreground text-xs">{t('cannotManageHigherRole')}</span>
          }

          const showEditRole = canUpdateRole
          const showRemoveUser = canDeleteUser

          if (!showEditRole && !showRemoveUser) {
            return <span className="text-muted-foreground text-xs">{t('noActionsForAdministrators')}</span>
          }

          return (
            <div className="flex items-center gap-2">
              {showEditRole && (
                <Modal
                  isDialogOpen={rolesModal ? selectedUser?.id === user.id : false}
                  onOpenChange={isOpen => {
                    if (!isOpen) handleCloseRolesModal()
                  }}
                  minHeight="no-min"
                  dialogContent={
                    selectedUser ? (
                      <RolesUpdate
                        alreadyAssignedRole={selectedUser.roles[0] ?? ''}
                        setRolesModal={setRolesModal}
                        user={{
                          id: selectedUser.id,
                          user_id: selectedUser.id,
                          username: selectedUser.username,
                          email: selectedUser.email,
                          first_name: selectedUser.display_name,
                        }}
                      />
                    ) : null
                  }
                  dialogTitle={t('updateRoleModalTitle')}
                  dialogDescription={t('updateRoleModalDescription', {
                    username: user.username,
                  })}
                  dialogTrigger={
                    <Button variant="outline" size="sm" type="button" onClick={() => handleRolesModal(user)}>
                      <KeyRound className="size-3.5" />
                      {t('editRoleButton')}
                    </Button>
                  }
                />
              )}
              {showRemoveUser &&
                (user.status === 'disabled' ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => handleSetDisabled(user.id, false)}>
                    <UserRoundCheck className="size-3.5" />
                    {t('enableUserButton')}
                  </Button>
                ) : (
                  <RemoveUserButton userId={user.id} name={accountLabel(user)} onRemove={handleRemoveUser} t={t} />
                ))}
            </div>
          )
        },
      },
    ],
    [
      canDeleteUser,
      canUpdateRole,
      currentUser?.id,
      currentUserPriority,
      handleCloseRolesModal,
      handleRolesModal,
      handleRemoveUser,
      handleSetDisabled,
      isAdminUser,
      roleLabel,
      rolePriority,
      rolesModal,
      selectedUser,
      t,
    ],
  )

  if (!hasMounted || isLoading) {
    return (
      <div className="mx-10 mt-6 space-y-3">
        <Skeleton className="h-16 w-full rounded-xl" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  // A 403 is a permission denial, not an empty org — rendering it through
  // the DataTable's "no results" state would tell a learner/teacher there
  // are simply no users, which is false and hides why they can't see any.
  if (isForbidden) {
    return (
      <div className="mx-10 mt-6">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t('activeUsersTitle')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertTriangle className="text-muted-foreground size-8" aria-hidden="true" />
            <p className="font-medium">{tErrors('accessDenied')}</p>
            <p className="text-muted-foreground text-sm">{tErrors('permissionDenied')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-10 mt-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t('activeUsersTitle')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <DataTable
            columns={columns}
            data={users}
            pageSize={USERS_PER_PAGE}
            storageKey="platform-users"
            labels={{
              searchPlaceholder: t('searchPlaceholder'),
              emptyMessage: t('noUsersFound'),
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default Users
