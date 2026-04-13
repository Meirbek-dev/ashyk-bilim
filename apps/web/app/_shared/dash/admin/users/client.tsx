'use client';

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
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { assignRoleToUser, removeRoleFromUser } from '@/services/rbac';
import { useBasicUsers, useRoles, useUserRoleAssignments } from '@/features/users/hooks/useUsers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Actions, PermissionGuard, Resources, Scopes } from '@/components/Security';
import { AlertTriangle, Calendar, Plus, Shield, Trash2, User } from 'lucide-react';
import type { UserRoleAssignment } from '@/types/permissions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSession } from '@/hooks/useSession';
import { getUserAvatarMediaDirectory } from '@/services/media/media';
import { useCallback, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import DataTable from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

export default function UserRolesClient() {
  const session = useSession();
  const t = useTranslations('Components.Roles');
  const locale = useLocale();
  const router = useRouter();
  const {
    data: userRoles = [],
    error: userRolesError,
    isPending: userRolesLoading,
    refetch: refetchUserRoles,
  } = useUserRoleAssignments();
  const { data: availableRoles = [], error: rolesError, isPending: rolesLoading } = useRoles();
  const { data: users = [], error: usersError, isPending: usersLoading } = useBasicUsers();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [assignmentToRemove, setAssignmentToRemove] = useState<{
    userId: number;
    roleId: number;
    roleName?: string;
  } | null>(null);

  const refreshSession = useCallback(async () => {
    router.refresh();
    if (!session.user) toast.warning(t('sessionRefreshWarning'));
  }, [router, session.user, t]);
  const loading = userRolesLoading || rolesLoading || usersLoading;

  // Add role to user
  const handleAddUserRole = async () => {
    if (!selectedUserId || !selectedRoleId) return;

    try {
      await assignRoleToUser(selectedUserId, selectedRoleId);
      toast.success(t('assignedRoleSuccess'));
      setIsAddDialogOpen(false);
      setSelectedUserId(null);
      setSelectedRoleId(null);
      await refetchUserRoles();
      // Refresh session so permission changes take effect immediately
      await refreshSession();
    } catch (error) {
      console.error('Failed to assign role:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to assign role');
    }
  };

  // Open remove confirmation dialog
  const handleRemoveUserRole = useCallback((userId: number, roleId: number, roleName?: string) => {
    setAssignmentToRemove({ userId, roleId, roleName });
  }, []);

  // Confirm remove role from user
  const confirmRemoveUserRole = async () => {
    if (!assignmentToRemove) return;

    const { userId, roleId } = assignmentToRemove;
    setAssignmentToRemove(null);

    try {
      await removeRoleFromUser(userId, roleId);
      toast.success(t('removedRoleSuccess'));
      await refetchUserRoles();
      // Refresh session so permission changes take effect immediately
      await refreshSession();
    } catch (error) {
      console.error('Failed to remove role:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to remove role');
    }
  };

  const columns = useMemo<ColumnDef<UserRoleAssignment>[]>(
    () => [
      {
        accessorFn: (assignment) =>
          [assignment.user?.first_name, assignment.user?.last_name, assignment.user?.username, assignment.user?.email]
            .filter(Boolean)
            .join(' '),
        id: 'user',
        header: t('userLabel'),
        cell: ({ row }) => {
          const assignment = row.original;
          return (
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage
                  src={
                    assignment.user?.avatar_image
                      ? assignment.user.avatar_image.startsWith('http')
                        ? assignment.user.avatar_image
                        : assignment.user.user_uuid
                          ? getUserAvatarMediaDirectory(assignment.user.user_uuid, assignment.user.avatar_image)
                          : undefined
                      : undefined
                  }
                />
                <AvatarFallback>
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium">
                  {assignment.user?.first_name
                    ? `${assignment.user.first_name} ${assignment.user.last_name || ''}`.trim()
                    : assignment.user?.username}
                </div>
                <div className="text-muted-foreground text-sm">{assignment.user?.email}</div>
              </div>
            </div>
          );
        },
      },
      {
        accessorFn: (assignment) => assignment.role?.name || `Role #${assignment.role_id}`,
        id: 'role',
        header: t('roleLabel'),
        cell: ({ row }) => (
          <Badge variant="secondary">
            <Shield className="mr-1 h-3 w-3" />
            {row.original.role?.name || `Role #${row.original.role_id}`}
          </Badge>
        ),
      },
      {
        accessorKey: 'assigned_at',
        header: t('assignedAt'),
        cell: ({ row }) => (
          <div className="text-muted-foreground flex items-center gap-1 text-sm">
            <Calendar className="h-3 w-3" />
            {new Date(row.original.assigned_at).toLocaleDateString(locale)}
          </div>
        ),
      },
      {
        id: 'actions',
        header: () => <div className="text-right">{t('actions')}</div>,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <PermissionGuard
              action={Actions.DELETE}
              resource={Resources.ROLE}
              scope={Scopes.PLATFORM}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  handleRemoveUserRole(row.original.user_id, row.original.role_id, row.original.role?.name)
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </PermissionGuard>
          </div>
        ),
      },
    ],
    [handleRemoveUserRole, locale, t],
  );

  if (loading) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (userRolesError || rolesError || usersError) {
    return <div className="text-destructive container mx-auto p-6 text-sm">{t('loadFailed')}</div>;
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('userRolesTitle')}</h1>
          <p className="text-muted-foreground">{t('userRolesDescription')}</p>
        </div>
        <PermissionGuard
          action={Actions.MANAGE}
          resource={Resources.ROLE}
          scope={Scopes.PLATFORM}
        >
          <Dialog
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
          >
            <DialogTrigger
              render={
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('assignRole')}
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('assignRoleTitle')}</DialogTitle>
                <DialogDescription>{t('assignRoleDescription')}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="user">{t('userLabel')}</Label>
                  <Select
                    value={selectedUserId?.toString() || ''}
                    onValueChange={(v) => setSelectedUserId(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectUserPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {users
                        .filter((user) => user.id !== undefined)
                        .map((user) => (
                          <SelectItem
                            key={user.id}
                            value={user.id.toString()}
                          >
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={user.avatar_image} />
                                <AvatarFallback>
                                  {(user.first_name?.[0] || user.username?.[0] || 'U').toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span>
                                {user.first_name || user.username} {`(${user.email})`}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="role">{t('roleLabel')}</Label>
                  <Select
                    value={selectedRoleId?.toString() || ''}
                    onValueChange={(v) => setSelectedRoleId(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectRolePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoles.map((role) => (
                        <SelectItem
                          key={role.id}
                          value={role.id.toString()}
                        >
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                >
                  {t('AddRole.cancel')}
                </Button>
                <Button
                  onClick={handleAddUserRole}
                  disabled={!selectedUserId || !selectedRoleId}
                >
                  {t('assignRole')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </PermissionGuard>
      </div>

      {/* User Roles Table */}
      <Card>
        <div className="p-6">
          <DataTable
            columns={columns}
            data={userRoles}
            pageSize={10}
            storageKey="platform-user-roles"
            labels={{
              searchPlaceholder: t('searchUsersOrRoles'),
              emptyMessage: t('noUserRoleAssignments'),
            }}
          />
        </div>
      </Card>

      <AlertDialog
        open={assignmentToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setAssignmentToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20">
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('removeRoleConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('removeRoleConfirmDescription', { roleName: assignmentToRemove?.roleName ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              variant="destructive"
              onClick={confirmRemoveUserRole}
            >
              {t('removeRoleConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
