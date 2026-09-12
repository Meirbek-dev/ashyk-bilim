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
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, Loader2, Pencil, SquareUserRound, Users, X } from 'lucide-react'
import EditUserGroup from '@/components/Objects/Modals/Dash/UserGroups/EditUserGroup'
import AddUserGroup from '@/components/Objects/Modals/Dash/UserGroups/AddUserGroup'
import ManageUsers from '@/components/Objects/Modals/Dash/UserGroups/ManageUsers'
import { deleteUserGroup } from '@services/usergroups/usergroups'
import { queryKeys } from '@/lib/react-query/queryKeys'
import Modal from '@/components/Objects/Elements/Modal/Modal'
import { useUserGroups } from '@/features/users/hooks/useUsers'
import { useSession } from '@/hooks/useSession'
import { Actions, Resources, Scopes } from '@/types/permissions'
import DataTable from '@components/ui/data-table'
import type { DataTableColumnDef } from '@components/ui/data-table'
import type { Usergroup } from '@/lib/api/generated/zod'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

interface DeleteUserGroupButtonProps {
  usergroupId: string
  onDelete: (usergroupId: string) => Promise<void>
  t: (key: string) => string
}

function DeleteUserGroupButton({ usergroupId, onDelete, t }: DeleteUserGroupButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      await onDelete(usergroupId)
      setIsOpen(false)
    })
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger
        render={
          <Button type="button" variant="destructive" size="sm">
            <X className="size-3.5" />
            {t('deleteButton')}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <AlertTriangle className="text-destructive size-6" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t('deleteModalTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteModalMessage')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} />
          <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t('deleteModalConfirmButton')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function UserGroups() {
  const t = useTranslations('DashPage.UserSettings.usergroupsSection')
  const [userGroupManagementModal, setUserGroupManagementModal] = useState(false)
  const [createUserGroupModal, setCreateUserGroupModal] = useState(false)
  const [editUserGroupModal, setEditUserGroupModal] = useState(false)
  const [selectedUserGroup, setSelectedUserGroup] = useState<Usergroup | null>(null)
  const [selectedUserGroupIdForEdit, setSelectedUserGroupIdForEdit] = useState<string | null>(null)
  const [selectedUserGroupIdForManage, setSelectedUserGroupIdForManage] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { can, session } = useSession()
  // Mirrors the server's write rule (`usergroup:manage:platform`, or the
  // creator holding `usergroup:create:platform`): no dead clicks into a 403.
  const canWrite = (group: Usergroup) =>
    can(Resources.USERGROUP, Actions.MANAGE, Scopes.APP) ||
    (group.creator_id === session?.userId && can(Resources.USERGROUP, Actions.CREATE, Scopes.APP))

  const { data: usergroups, error, isPending } = useUserGroups()

  const deleteUserGroupUI = async (usergroup_id: string) => {
    const toastId = toast.loading(t('deletingUserGroup'))
    try {
      await deleteUserGroup(usergroup_id)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.userGroups.all(),
      })
      toast.success(t('userGroupDeletedSuccess'), { id: toastId })
    } catch {
      toast.error(t('errors.deleteUserGroupFailed'), { id: toastId })
    }
  }

  const handleOpenModal = (modalType: 'manage' | 'edit', userGroup: Usergroup) => {
    setSelectedUserGroup(userGroup)
    if (modalType === 'manage') {
      setSelectedUserGroupIdForManage(userGroup.id ?? null)
      setUserGroupManagementModal(true)
    } else if (modalType === 'edit') {
      setSelectedUserGroupIdForEdit(userGroup.id ?? null)
      setEditUserGroupModal(true)
    }
  }

  const handleCloseModal = (modalType: 'manage' | 'edit' | 'create') => {
    setSelectedUserGroup(null)
    if (modalType === 'manage') {
      setSelectedUserGroupIdForManage(null)
      setUserGroupManagementModal(false)
    } else if (modalType === 'edit') {
      setSelectedUserGroupIdForEdit(null)
      setEditUserGroupModal(false)
    } else if (modalType === 'create') {
      setCreateUserGroupModal(false)
    }
  }

  const columns: DataTableColumnDef<Usergroup>[] = [
    {
      accessorKey: 'name',
      header: t('userGroupHeader'),
    },
    {
      accessorFn: usergroup => usergroup.description || '',
      id: 'description',
      header: t('descriptionHeader'),
      cell: ({ row }) => row.original.description || '—',
    },
    {
      id: 'manageUsers',
      header: t('manageUsersHeader'),
      enableSorting: false,
      cell: ({ row }) =>
        canWrite(row.original) ? (
          <Modal
            isDialogOpen={userGroupManagementModal ? selectedUserGroupIdForManage === row.original.id : false}
            onOpenChange={isOpen => {
              if (!isOpen) handleCloseModal('manage')
            }}
            minHeight="lg"
            minWidth="lg"
            dialogContent={selectedUserGroup ? <ManageUsers usergroup_id={selectedUserGroup.id} /> : null}
            dialogTitle={t('manageUsersModalTitle')}
            dialogDescription={t('manageUsersModalDescription')}
            dialogTrigger={
              <span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenModal('manage', row.original)}
                  type="button"
                >
                  <Users className="size-3.5" />
                  {t('manageUsersButton')}
                </Button>
              </span>
            }
          />
        ) : (
          <span className="text-muted-foreground text-xs">{t('readOnlyGroup')}</span>
        ),
    },
    {
      id: 'actions',
      header: t('actionsHeader'),
      enableSorting: false,
      cell: ({ row }) =>
        canWrite(row.original) ? (
          <div className="flex items-center gap-2">
            <Modal
              isDialogOpen={editUserGroupModal ? selectedUserGroupIdForEdit === row.original.id : false}
              onOpenChange={isOpen => {
                if (!isOpen) handleCloseModal('edit')
              }}
              dialogTrigger={
                <span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenModal('edit', row.original)}
                    type="button"
                  >
                    <Pencil className="size-3.5" />
                    {t('editButton')}
                  </Button>
                </span>
              }
              minHeight="sm"
              minWidth="sm"
              dialogContent={
                selectedUserGroup ? (
                  <EditUserGroup
                    usergroup={{
                      id: selectedUserGroup.id,
                      name: selectedUserGroup.name ?? '',
                      description: selectedUserGroup.description ?? '',
                    }}
                  />
                ) : null
              }
            />
            <DeleteUserGroupButton usergroupId={row.original.id} onDelete={deleteUserGroupUI} t={t} />
          </div>
        ) : null,
    },
  ]

  return (
    <>
      <div className="h-6" />
      <div className="mx-10">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
            <CardAction>
              <Modal
                isDialogOpen={createUserGroupModal}
                onOpenChange={isOpen => {
                  if (!isOpen) handleCloseModal('create')
                  else setCreateUserGroupModal(true)
                }}
                minHeight="no-min"
                dialogContent={<AddUserGroup setCreateUserGroupModal={setCreateUserGroupModal} />}
                dialogTitle={t('createUserGroupModalTitle')}
                dialogDescription={t('createUserGroupModalDescription')}
                dialogTrigger={
                  <span>
                    <Button size="sm">
                      <SquareUserRound className="size-3.5" />
                      {t('createUserGroupButton')}
                    </Button>
                  </span>
                }
              />
            </CardAction>
          </CardHeader>
          <CardContent className="pt-4">
            {/* `isPending`, not `isLoading`: while the persisted cache is
                restoring the client is pending-but-idle, so `isLoading` is
                false on the client and true on the server (hydration mismatch). */}
            {isPending ? (
              <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm" role="status">
                <Loader2 size={16} className="animate-spin" aria-hidden />
                {t('loading')}
              </div>
            ) : error ? (
              <div className="text-destructive py-6 text-sm">{t('errorLoadingUserGroups')}</div>
            ) : (
              <DataTable
                columns={columns}
                data={usergroups ?? []}
                pageSize={10}
                storageKey="platform-usergroups"
                labels={{ emptyMessage: t('noUserGroupsFound') }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

export default UserGroups
