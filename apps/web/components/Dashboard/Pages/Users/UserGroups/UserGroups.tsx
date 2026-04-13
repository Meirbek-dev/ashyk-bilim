'use client';

import { useQueryClient } from '@tanstack/react-query';
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
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Loader2, Pencil, SquareUserRound, Users, X } from 'lucide-react';
import EditUserGroup from '@/components/Objects/Modals/Dash/UserGroups/EditUserGroup';
import AddUserGroup from '@/components/Objects/Modals/Dash/UserGroups/AddUserGroup';
import ManageUsers from '@/components/Objects/Modals/Dash/UserGroups/ManageUsers';
import { deleteUserGroup } from '@services/usergroups/usergroups';
import { queryKeys } from '@/lib/react-query/queryKeys';
import Modal from '@/components/Objects/Elements/Modal/Modal';
import { useUserGroups } from '@/features/users/hooks/useUsers';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '@components/ui/data-table';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

interface DeleteUserGroupButtonProps {
  usergroupId: number;
  onDelete: (usergroupId: number) => Promise<void>;
  t: (key: string) => string;
}

interface UserGroup {
  id: number;
  name: string;
  description?: string;
}

function DeleteUserGroupButton({ usergroupId, onDelete, t }: DeleteUserGroupButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await onDelete(usergroupId);
      setIsOpen(false);
    });
  }

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <AlertDialogTrigger
        render={
          <button className="flex items-center space-x-2 rounded-md bg-rose-700 p-1 px-3 text-sm font-bold text-rose-100 hover:cursor-pointer">
            <X className="h-4 w-4" />
            <span>{t('deleteButton')}</span>
          </button>
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
          <AlertDialogAction
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t('deleteModalConfirmButton')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const UserGroups = () => {
  const t = useTranslations('DashPage.UserSettings.usergroupsSection');
  const [userGroupManagementModal, setUserGroupManagementModal] = useState(false);
  const [createUserGroupModal, setCreateUserGroupModal] = useState(false);
  const [editUserGroupModal, setEditUserGroupModal] = useState(false);
  const [selectedUserGroup, setSelectedUserGroup] = useState<any | null>(null);
  const [selectedUserGroupIdForEdit, setSelectedUserGroupIdForEdit] = useState<number | null>(null);
  const [selectedUserGroupIdForManage, setSelectedUserGroupIdForManage] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: usergroups, error, isLoading } = useUserGroups();

  const deleteUserGroupUI = async (usergroup_id: number) => {
    const toastId = toast.loading(t('deletingUserGroup'));
    try {
      const res = await deleteUserGroup(usergroup_id);
      if (res.status === 200) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.userGroups.all() });
        toast.success(t('userGroupDeletedSuccess'), { id: toastId });
      } else {
        toast.error(t('errors.deleteUserGroupFailed'), { id: toastId });
      }
    } catch {
      toast.error(t('errors.deleteUserGroupFailed'), { id: toastId });
    }
  };

  const handleOpenModal = (modalType: 'manage' | 'edit', userGroup: any) => {
    setSelectedUserGroup(userGroup);
    if (modalType === 'manage') {
      setSelectedUserGroupIdForManage(userGroup.id);
      setUserGroupManagementModal(true);
    } else if (modalType === 'edit') {
      setSelectedUserGroupIdForEdit(userGroup.id);
      setEditUserGroupModal(true);
    }
  };

  const handleCloseModal = (modalType: 'manage' | 'edit' | 'create') => {
    setSelectedUserGroup(null);
    if (modalType === 'manage') {
      setSelectedUserGroupIdForManage(null);
      setUserGroupManagementModal(false);
    } else if (modalType === 'edit') {
      setSelectedUserGroupIdForEdit(null);
      setEditUserGroupModal(false);
    } else if (modalType === 'create') {
      setCreateUserGroupModal(false);
    }
  };

  if (isLoading) {
    return (
      <Loader2
        size={16}
        className="mr-2 animate-spin"
      />
    );
  }
  if (error) return <div>{t('errorLoadingUserGroups')}</div>;

  const columns: ColumnDef<UserGroup>[] = [
    {
      accessorKey: 'name',
      header: t('userGroupHeader'),
    },
    {
      accessorFn: (usergroup) => usergroup.description || '',
      id: 'description',
      header: t('descriptionHeader'),
      cell: ({ row }) => row.original.description || '—',
    },
    {
      id: 'manageUsers',
      header: t('manageUsersHeader'),
      enableSorting: false,
      cell: ({ row }) => (
        <Modal
          isDialogOpen={userGroupManagementModal ? selectedUserGroupIdForManage === row.original.id : false}
          onOpenChange={(isOpen) => {
            if (!isOpen) handleCloseModal('manage');
          }}
          minHeight="lg"
          minWidth="lg"
          dialogContent={selectedUserGroup ? <ManageUsers usergroup_id={selectedUserGroup.id} /> : null}
          dialogTitle={t('manageUsersModalTitle')}
          dialogDescription={t('manageUsersModalDescription')}
          dialogTrigger={
            <span>
              <button
                className="flex items-center space-x-2 rounded-md bg-yellow-700 p-1 px-3 text-sm font-bold text-yellow-100 hover:cursor-pointer"
                onClick={() => {
                  handleOpenModal('manage', row.original);
                }}
                type="button"
              >
                <Users className="h-4 w-4" />
                <span>{t('manageUsersButton')}</span>
              </button>
            </span>
          }
        />
      ),
    },
    {
      id: 'actions',
      header: t('actionsHeader'),
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex space-x-2">
          <Modal
            isDialogOpen={editUserGroupModal ? selectedUserGroupIdForEdit === row.original.id : false}
            onOpenChange={(isOpen) => {
              if (!isOpen) handleCloseModal('edit');
            }}
            dialogTrigger={
              <span>
                <button
                  className="flex items-center space-x-2 rounded-md bg-sky-700 p-1 px-3 text-sm font-bold text-sky-100 hover:cursor-pointer"
                  onClick={() => {
                    handleOpenModal('edit', row.original);
                  }}
                  type="button"
                >
                  <Pencil className="size-4" />
                  <span>{t('editButton')}</span>
                </button>
              </span>
            }
            minHeight="sm"
            minWidth="sm"
            dialogContent={selectedUserGroup ? <EditUserGroup usergroup={selectedUserGroup} /> : null}
          />
          <DeleteUserGroupButton
            usergroupId={row.original.id}
            onDelete={deleteUserGroupUI}
            t={t}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="h-6" />
      <div className="border-border bg-card mx-auto mr-10 ml-10 rounded-xl border px-4 py-4 shadow-xs">
        <div className="bg-muted mb-3 flex flex-col -space-y-1 rounded-md px-5 py-3">
          <h1 className="text-foreground text-xl font-bold">{t('title')}</h1>
          <h2 className="text-muted-foreground text-sm">{t('description')}</h2>
        </div>
        <DataTable
          columns={columns}
          data={usergroups ?? []}
          pageSize={10}
          storageKey="platform-usergroups"
          labels={{ emptyMessage: t('noUserGroupsFound') }}
        />
        <div className="mt-3 mr-2 flex justify-end">
          <Modal
            isDialogOpen={createUserGroupModal}
            onOpenChange={(isOpen) => {
              if (!isOpen) handleCloseModal('create');
              else setCreateUserGroupModal(true);
            }}
            minHeight="no-min"
            dialogContent={<AddUserGroup setCreateUserGroupModal={setCreateUserGroupModal} />}
            dialogTitle={t('createUserGroupModalTitle')}
            dialogDescription={t('createUserGroupModalDescription')}
            dialogTrigger={
              <span>
                <button className="flex items-center space-x-2 rounded-md bg-green-700 p-1 px-3 text-sm font-semibold text-green-100 hover:cursor-pointer">
                  <SquareUserRound className="h-4 w-4" />
                  <span>{t('createUserGroupButton')}</span>
                </button>
              </span>
            }
          />
        </div>
      </div>
    </>
  );
};

export default UserGroups;
