'use client'

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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Actions, Resources, Scopes } from '@/components/Security'
import RolesUpdate from '@/components/Objects/Modals/Dash/Users/RolesUpdate'
import { useSession } from '@/hooks/useSession'
import { useMembers } from '@/features/users/hooks/useUsers'
import type { ColumnDef } from '@tanstack/react-table'
import DataTable from '@/components/ui/data-table'

import { AlertTriangle, KeyRound, Loader2, LogOut } from 'lucide-react'
import Modal from '@/components/Objects/Elements/Modal/Modal'
import { removeUser } from '@/services/platform/platform'
import { membersQueryOptions, userRoleAssignmentsQueryOptions } from '@/features/users/queries/users.query'
import React, { useState, useTransition, useSyncExternalStore } from 'react'

const emptySubscribe = () => () => {}
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

const USERS_PER_PAGE = 20

interface RemoveUserButtonProps {
  userId: number
  username: string
  onRemove: (userId: number) => Promise<void>
  t: (key: string, values?: Record<string, string>) => string
}

interface UserRow {
  user: {
    id: number
    user_uuid?: string
    username: string
    first_name?: string
    middle_name?: string
    last_name?: string
    email?: string
  }
  role: {
    id?: number
    name?: string
    priority?: number
  }
}

function RemoveUserButton({ userId, username, onRemove, t }: RemoveUserButtonProps) {
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
            <LogOut className="size-3.5" />
            {t('removeFromOrgButton')}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <AlertTriangle className="text-destructive size-6" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t('removeUserModalTitle', { username })}</AlertDialogTitle>
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

const Users = () => {
  const { session: sessionData, user: currentUser, can } = useSession()
  const t = useTranslations('DashPage.UserSettings.usersSection')
  const userRoles = sessionData?.roles ?? []
  const canUpdateRole = can(Resources.ROLE, Actions.UPDATE, Scopes.APP)
  const canDeleteUser = can(Resources.USER, Actions.DELETE, Scopes.APP)

  const getRolePriority = (roleObj: { role?: unknown; priority?: number } | string | null | undefined) => {
    if (!roleObj) return 0
    if (typeof roleObj === 'string') return 0
    let priority = roleObj.priority
    if (roleObj.role && typeof roleObj.role === 'object' && 'priority' in roleObj.role) {
      const nested = roleObj.role as { priority?: unknown }
      if (typeof nested.priority === 'number') {
        priority = nested.priority
      }
    }
    return priority ?? 0
  }

  const currentUserPriority = (() => {
    try {
      if (!userRoles || userRoles.length === 0) return 0
      return Math.max(...userRoles.map((r: AppRoleSummary) => getRolePriority(r.role || r)))
    } catch {
      return 0
    }
  })()

  const [currentPage, setCurrentPage] = useState(1)
  const queryClient = useQueryClient()
  const { data: usersData, isLoading } = useMembers(currentPage, USERS_PER_PAGE)
  const hasMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )

  const totalUsers = usersData?.total ?? 0
  const totalPages = usersData?.total_pages ?? 1

  const [rolesModal, setRolesModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)

  const handleRolesModal = (user: UserRow) => {
    setSelectedUser(user)
    setRolesModal(true)
  }

  const handleCloseRolesModal = () => {
    setSelectedUser(null)
    setRolesModal(false)
  }

  const handleRemoveUser = async (user_id: number) => {
    const toastId = toast.loading(t('removingUser'))
    try {
      const res = await removeUser(user_id)
      if (res.success || res.status === 200) {
        await queryClient.invalidateQueries({
          queryKey: membersQueryOptions(1, 20).queryKey.slice(0, 2),
        })
        await queryClient.invalidateQueries({
          queryKey: userRoleAssignmentsQueryOptions().queryKey,
        })
        toast.success(t('userRemovedSuccess'), { id: toastId })
      } else {
        toast.error(t('errors.removeUserFailed'), { id: toastId })
      }
    } catch {
      toast.error(t('errors.removeUserFailed'), { id: toastId })
    }
  }

  const users = (usersData?.users ?? []) as UserRow[]
  const columns: ColumnDef<UserRow>[] = [
    {
      accessorFn: row =>
        [row.user.first_name, row.user.middle_name, row.user.last_name, row.user.username, row.user.email]
          .filter(Boolean)
          .join(' '),
      id: 'user',
      header: t('userHeader'),
      cell: ({ row }) => {
        const fullName = [row.original.user.first_name, row.original.user.middle_name, row.original.user.last_name]
          .filter(Boolean)
          .join(' ')
        return (
          <div className="flex items-center gap-2">
            {fullName && <span className="font-medium">{fullName}</span>}
            <Badge variant="outline" className="font-mono text-xs">
              @{row.original.user.username}
            </Badge>
          </div>
        )
      },
    },
    {
      accessorFn: row => row.role?.name || '',
      id: 'role',
      header: t('roleHeader'),
      cell: ({ row }) => (row.original.role?.name ? <Badge variant="secondary">{row.original.role.name}</Badge> : null),
    },
    {
      id: 'actions',
      header: t('actionsHeader'),
      enableSorting: false,
      cell: ({ row }) => {
        const user = row.original
        const isSelf = currentUser?.user_uuid === user.user.user_uuid || currentUser?.id === user.user.id
        const targetPriority = getRolePriority(user.role)
        const canManage = !isSelf && currentUserPriority > targetPriority
        const isMainAdmin = currentUser?.id === 1

        if (isSelf) return <span className="text-muted-foreground text-xs">{t('cannotEditSelf')}</span>
        if (!isSelf && !isMainAdmin && currentUserPriority <= targetPriority) {
          return <span className="text-muted-foreground text-xs">{t('cannotManageHigherRole')}</span>
        }
        if (!canManage) return <span className="text-muted-foreground text-xs">{t('noActionsForAdministrators')}</span>

        const showEditRole = canUpdateRole
        const showRemoveUser = canDeleteUser

        if (!showEditRole && !showRemoveUser) {
          return <span className="text-muted-foreground text-xs">{t('noActionsForAdministrators')}</span>
        }

        return (
          <div className="flex items-center gap-2">
            {showEditRole && (
              <Modal
                isDialogOpen={rolesModal ? selectedUser?.user?.user_uuid === user.user.user_uuid : false}
                onOpenChange={isOpen => {
                  if (!isOpen) handleCloseRolesModal()
                }}
                minHeight="no-min"
                dialogContent={
                  selectedUser ? (
                    <RolesUpdate
                      alreadyAssignedRole={selectedUser.role?.id?.toString() || ''}
                      setRolesModal={setRolesModal}
                      user={{
                        id: selectedUser.user.id,
                        user_id: selectedUser.user.id,
                        username: selectedUser.user.username,
                        ...(selectedUser.user.user_uuid ? { user_uuid: selectedUser.user.user_uuid } : {}),
                        ...(selectedUser.user.email ? { email: selectedUser.user.email } : {}),
                        ...(selectedUser.user.first_name ? { first_name: selectedUser.user.first_name } : {}),
                        ...(selectedUser.user.middle_name ? { middle_name: selectedUser.user.middle_name } : {}),
                        ...(selectedUser.user.last_name ? { last_name: selectedUser.user.last_name } : {}),
                        user: {
                          id: selectedUser.user.id,
                          username: selectedUser.user.username,
                          ...(selectedUser.user.user_uuid ? { user_uuid: selectedUser.user.user_uuid } : {}),
                          ...(selectedUser.user.email ? { email: selectedUser.user.email } : {}),
                          ...(selectedUser.user.first_name ? { first_name: selectedUser.user.first_name } : {}),
                          ...(selectedUser.user.middle_name ? { middle_name: selectedUser.user.middle_name } : {}),
                          ...(selectedUser.user.last_name ? { last_name: selectedUser.user.last_name } : {}),
                        },
                      }}
                    />
                  ) : null
                }
                dialogTitle={t('updateRoleModalTitle')}
                dialogDescription={t('updateRoleModalDescription', {
                  username: user.user.username,
                })}
                dialogTrigger={
                  <span>
                    <Button variant="outline" size="sm" onClick={() => handleRolesModal(user)}>
                      <KeyRound className="size-3.5" />
                      {t('editRoleButton')}
                    </Button>
                  </span>
                }
              />
            )}
            {showRemoveUser && (
              <RemoveUserButton userId={user.user.id} username={user.user.username} onRemove={handleRemoveUser} t={t} />
            )}
          </div>
        )
      },
    },
  ]

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
            serverPaginated
            storageKey="platform-users"
            labels={{
              searchPlaceholder: t('searchPlaceholder'),
              emptyMessage: t('noUsersFound'),
            }}
          />
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <p className="text-muted-foreground text-sm">
                {t('paginationInfo', {
                  start: String((currentPage - 1) * USERS_PER_PAGE + 1),
                  end: String(Math.min(currentPage * USERS_PER_PAGE, totalUsers)),
                  total: String(totalUsers),
                })}
              </p>
              <Pagination>
                <PaginationContent>
                  <PaginationItem key="prev">
                    <PaginationPrevious
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      aria-disabled={currentPage === 1}
                      className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => {
                      if (totalPages <= 7) return true
                      if (page === 1 || page === totalPages) return true
                      if (Math.abs(page - currentPage) <= 1) return true
                      return false
                    })
                    .map((page, idx, arr) => {
                      const prev = arr[idx - 1]
                      const showEllipsisBefore = idx > 0 && typeof prev !== 'undefined' && page - prev > 1
                      return (
                        <React.Fragment key={`fragment-${page}`}>
                          {showEllipsisBefore && (
                            <PaginationItem key={`ellipsis-${page}`}>
                              <PaginationEllipsis />
                            </PaginationItem>
                          )}
                          <PaginationItem key={`page-${page}`}>
                            <PaginationLink
                              onClick={() => setCurrentPage(page)}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        </React.Fragment>
                      )
                    })}
                  <PaginationItem key="next">
                    <PaginationNext
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      aria-disabled={currentPage === totalPages}
                      className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default Users
