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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Actions, Resources, Scopes } from '@/components/Security';
import RolesUpdate from '@/components/Objects/Modals/Dash/Users/RolesUpdate';
import { useSession } from '@/hooks/useSession';
import { useMembers } from '@/features/users/hooks/useUsers';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '@/components/ui/data-table';

import { AlertTriangle, KeyRound, Loader2, LogOut } from 'lucide-react';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import Modal from '@/components/Objects/Elements/Modal/Modal';
import { removeUser } from '@/services/platform/platform';
import { queryKeys } from '@/lib/react-query/queryKeys';
import React, { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

const USERS_PER_PAGE = 20;

interface RemoveUserButtonProps {
  userId: number;
  username: string;
  onRemove: (userId: number) => Promise<void>;
  t: (key: string, values?: Record<string, string>) => string;
}

interface UserRow {
  user: {
    id: number;
    user_uuid?: string;
    username: string;
    first_name?: string;
    middle_name?: string;
    last_name?: string;
    email?: string;
  };
  role: {
    id?: number;
    name?: string;
    priority?: number;
  };
}

function RemoveUserButton({ userId, username, onRemove, t }: RemoveUserButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    startTransition(async () => {
      await onRemove(userId);
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
          <button className="mr-2 flex items-center space-x-2 rounded-md bg-rose-700 p-1 px-3 text-sm font-bold text-rose-100 hover:cursor-pointer">
            <LogOut className="h-4 w-4" />
            <span>{t('removeFromOrgButton')}</span>
          </button>
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
          <AlertDialogAction
            variant="destructive"
            onClick={handleRemove}
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t('removeUserButton')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const Users = () => {
  const { session: sessionData, user: currentUser, can } = useSession();
  const t = useTranslations('DashPage.UserSettings.usersSection');
  const userRoles = sessionData?.roles ?? [];
  const canUpdateRole = can(Resources.ROLE, Actions.UPDATE, Scopes.PLATFORM);
  const canDeleteUser = can(Resources.USER, Actions.DELETE, Scopes.PLATFORM);

  const getRolePriority = (roleObj: any) => {
    if (!roleObj) return 0;
    // roleObj may be the role itself or wrapped under `role`
    const role = roleObj.role || roleObj;
    return role.priority ?? 0;
  };

  const currentUserPriority = (() => {
    try {
      if (!userRoles || userRoles.length === 0) return 0;
      if (userRoles.length === 0) return 0;
      // return highest priority among user's roles
      return Math.max(...userRoles.map((r: any) => getRolePriority(r.role || r)));
    } catch {
      return 0;
    }
  })();

  const [currentPage, setCurrentPage] = useState(1);
  const queryClient = useQueryClient();

  const { data: usersData, error, isLoading } = useMembers(currentPage, USERS_PER_PAGE);

  const totalUsers = usersData?.total ?? 0;
  const totalPages = usersData?.total_pages ?? 1;

  const [rolesModal, setRolesModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  const handleRolesModal = (user: any) => {
    setSelectedUser(user);
    setRolesModal(true);
  };

  const handleCloseRolesModal = () => {
    setSelectedUser(null);
    setRolesModal(false);
  };

  const handleRemoveUser = async (user_id: number) => {
    const toastId = toast.loading(t('removingUser'));
    try {
      const res = await removeUser(user_id);
      if (res.status === 200) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.users.members(currentPage, USERS_PER_PAGE) });
        toast.success(t('userRemovedSuccess'), { id: toastId });
      } else {
        toast.error(t('errors.removeUserFailed'), { id: toastId });
      }
    } catch {
      toast.error(t('errors.removeUserFailed'), { id: toastId });
    }
  };

  const users = (usersData?.users ?? []) as UserRow[];
  const columns: ColumnDef<UserRow>[] = [
    {
      accessorFn: (row) =>
        [row.user.first_name, row.user.middle_name, row.user.last_name, row.user.username, row.user.email]
          .filter(Boolean)
          .join(' '),
      id: 'user',
      header: t('userHeader'),
      cell: ({ row }) => (
        <div className="flex items-center space-x-2">
          <span>
            {[row.original.user.first_name, row.original.user.middle_name, row.original.user.last_name]
              .filter(Boolean)
              .join(' ')}
          </span>
          <span className="rounded-full bg-neutral-100 p-1 px-2 text-xs font-semibold text-neutral-400">
            @{row.original.user.username}
          </span>
        </div>
      ),
    },
    {
      accessorFn: (row) => row.role?.name || '',
      id: 'role',
      header: t('roleHeader'),
      cell: ({ row }) => row.original.role?.name,
    },
    {
      id: 'actions',
      header: t('actionsHeader'),
      enableSorting: false,
      cell: ({ row }) => {
        const user = row.original;
        const isSelf = currentUser?.user_uuid === user.user.user_uuid || currentUser?.id === user.user.id;
        const targetPriority = getRolePriority(user.role);
        const canManage = !isSelf && currentUserPriority > targetPriority;

        if (isSelf) return <div className="text-neutral-500">{t('cannotEditSelf')}</div>;
        if (currentUserPriority <= targetPriority) {
          return <div className="text-neutral-500">{t('cannotManageHigherRole')}</div>;
        }
        if (!canManage) return <div className="text-neutral-500">{t('noActionsForAdministrators')}</div>;

        const showEditRole = canUpdateRole;
        const showRemoveUser = canDeleteUser;

        if (!showEditRole && !showRemoveUser) {
          return <div className="text-neutral-500">{t('noActionsForAdministrators')}</div>;
        }

        return (
          <div className="flex items-end space-x-2">
            {showEditRole && (
              <Modal
                isDialogOpen={rolesModal ? selectedUser?.user?.user_uuid === user.user.user_uuid : false}
                onOpenChange={(isOpen) => {
                  if (!isOpen) handleCloseRolesModal();
                }}
                minHeight="no-min"
                dialogContent={
                  selectedUser ? (
                    <RolesUpdate
                      alreadyAssignedRole={selectedUser.role?.id?.toString()}
                      setRolesModal={setRolesModal}
                      user={selectedUser}
                    />
                  ) : null
                }
                dialogTitle={t('updateRoleModalTitle')}
                dialogDescription={t('updateRoleModalDescription', {
                  username: user.user.username,
                })}
                dialogTrigger={
                  <span>
                    <button
                      className="flex items-center space-x-2 rounded-md bg-yellow-700 p-1 px-3 text-sm font-bold text-yellow-100 hover:cursor-pointer"
                      onClick={() => {
                        handleRolesModal(user);
                      }}
                    >
                      <KeyRound className="h-4 w-4" />
                      <span>{t('editRoleButton')}</span>
                    </button>
                  </span>
                }
              />
            )}

            {showRemoveUser && (
              <RemoveUserButton
                userId={user.user.id}
                username={user.user.username}
                onRemove={handleRemoveUser}
                t={t}
              />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      {isLoading ? (
        <div>
          <PageLoading />
        </div>
      ) : (
        <>
          <div className="h-6" />
          <div className="border-border bg-card mx-auto mr-10 ml-10 rounded-xl border px-4 py-4 shadow-xs">
            <div className="bg-muted mb-3 flex flex-col -space-y-1 rounded-md px-5 py-3">
              <h1 className="text-foreground text-xl font-bold">{t('activeUsersTitle')}</h1>
              <h2 className="text-muted-foreground text-base"> {t('description')}</h2>
            </div>
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
              <div className="mt-4 flex items-center justify-between px-2">
                <div className="text-muted-foreground text-sm">
                  {t('paginationInfo', {
                    start: String((currentPage - 1) * USERS_PER_PAGE + 1),
                    end: String(Math.min(currentPage * USERS_PER_PAGE, totalUsers)),
                    total: String(totalUsers),
                  })}
                </div>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem key="prev">
                      <PaginationPrevious
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        aria-disabled={currentPage === 1}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => {
                        if (totalPages <= 7) return true;
                        if (page === 1 || page === totalPages) return true;
                        if (Math.abs(page - currentPage) <= 1) return true;
                        return false;
                      })
                      .map((page, idx, arr) => {
                        const prev = arr[idx - 1];
                        const showEllipsisBefore = idx > 0 && typeof prev !== 'undefined' && page - prev > 1;
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
                        );
                      })}
                    <PaginationItem key="next">
                      <PaginationNext
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        aria-disabled={currentPage === totalPages}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Users;
