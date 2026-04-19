'use client';

import {
  addPermissionToRole,
  createRole as apiCreateRole,
  deleteRole as apiDeleteRole,
  getRole as apiGetRole,
  getRolePermissions,
  removePermissionFromRole,
  updateRole as apiUpdateRole,
} from '@/services/rbac';
import { usePlatformPermissions } from '@/features/platform/hooks/usePlatform';
import { useRoleAuditLog, useRoles } from '@/features/users/hooks/useUsers';
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
  AlertTriangle,
  ChevronRight,
  Copy,
  Edit,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  Users,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Actions, PermissionGuard, Resources, Scopes } from '@/components/Security';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/hooks/useSession';
import type { Permission, RoleAuditEvent, RoleWithPermissions } from '@/types/permissions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import DataTable from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

type RoleDialogMode = 'create' | 'edit' | 'clone';

const EMPTY_ROLES: RoleWithPermissions[] = [];
const EMPTY_PERMISSIONS: Permission[] = [];

export default function RBACAdminClient() {
  const session = useSession();
  const { can } = session;
  const t = useTranslations('Components.Roles');
  const router = useRouter();

  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [activeTab, setActiveTab] = useState('roles');

  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [roleDialogMode, setRoleDialogMode] = useState<RoleDialogMode>('create');
  const [roleDialogRole, setRoleDialogRole] = useState<RoleWithPermissions | null>(null);

  const [permissionsRole, setPermissionsRole] = useState<RoleWithPermissions | null>(null);
  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false);
  const [isPermissionsDialogLoading, setIsPermissionsDialogLoading] = useState(false);
  const [permissionSearchQuery, setPermissionSearchQuery] = useState('');
  const [permissionResourceFilter, setPermissionResourceFilter] = useState('all');
  const [pendingPermissionIds, setPendingPermissionIds] = useState<number[]>([]);
  const [pendingResourceToggles, setPendingResourceToggles] = useState<string[]>([]);

  const [deletingRoleId, setDeletingRoleId] = useState<number | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<RoleWithPermissions | null>(null);

  const [auditPage, setAuditPage] = useState(1);
  const isSuperAdmin = can(Resources.ROLE, Actions.MANAGE, Scopes.ALL);
  const currentUserMaxPriority = useMemo(() => {
    const sessionRoles = session.session?.roles ?? [];
    return sessionRoles.reduce(
      (maxPriority: number, assignment: (typeof sessionRoles)[number]) =>
        Math.max(maxPriority, assignment.role?.priority ?? 0),
      0,
    );
  }, [session.session?.roles]);

  const {
    data: permissions = EMPTY_PERMISSIONS,
    isLoading: permissionsLoading,
    error: permissionsError,
  } = usePlatformPermissions();
  const {
    data: fetchedRoles = EMPTY_ROLES,
    isLoading: loadingRoles,
    error: rolesError,
    refetch: refetchRoles,
  } = useRoles();
  const auditLogQuery = useRoleAuditLog(auditPage, 20, {
    enabled: activeTab === 'audit',
  });
  const auditData = useMemo(() => {
    if (!auditLogQuery.data) {
      return null;
    }

    return {
      items: Array.isArray(auditLogQuery.data.items) ? auditLogQuery.data.items : [],
      total: typeof auditLogQuery.data.total === 'number' ? auditLogQuery.data.total : 0,
      page_size:
        typeof auditLogQuery.data.page_size === 'number' && auditLogQuery.data.page_size > 0
          ? auditLogQuery.data.page_size
          : 20,
    } satisfies {
      items: RoleAuditEvent[];
      total: number;
      page_size: number;
    };
  }, [auditLogQuery.data]);
  const isAuditLoading = activeTab === 'audit' && (auditLogQuery.isLoading || auditLogQuery.isFetching);

  const fetchRoles = useCallback(async () => {
    const result = await refetchRoles();
    if (result.error) {
      throw result.error;
    }
  }, [refetchRoles]);

  const refreshSession = useCallback(async () => {
    router.refresh();
    if (!session.user) toast.warning(t('sessionRefreshWarning'));
  }, [router, session.user, t]);

  const loadRoleWithPermissions = async (roleId: number): Promise<RoleWithPermissions> => {
    const [role, rolePermissions] = await Promise.all([apiGetRole(roleId), getRolePermissions(roleId)]);

    return {
      ...role,
      permissions: rolePermissions,
      permissions_count: rolePermissions.length,
    };
  };

  const mergeRole = (updated: RoleWithPermissions) => {
    setRoles((prev) =>
      prev.map((role) =>
        role.id === updated.id
          ? {
              ...role,
              ...updated,
              permissions: updated.permissions,
              permissions_count: updated.permissions.length,
            }
          : role,
      ),
    );
  };

  useEffect(() => {
    const sortedRoles = fetchedRoles
      .toSorted((a, b) => {
        const aSystem = a.is_system ? 0 : 1;
        const bSystem = b.is_system ? 0 : 1;
        if (aSystem !== bSystem) return aSystem - bSystem;
        return (b.priority ?? 0) - (a.priority ?? 0);
      })
      .map((role) => Object.assign(role, { permissions: [] }));

    setRoles(sortedRoles);
  }, [fetchedRoles]);

  useEffect(() => {
    if (permissionsError) {
      toast.error(t('loadFailed'));
    }
  }, [permissionsError, t]);

  useEffect(() => {
    if (rolesError) {
      console.error('Failed to fetch RBAC roles:', rolesError);
      toast.error(t('loadFailed'));
    }
  }, [rolesError, t]);

  useEffect(() => {
    if (activeTab !== 'audit' || !auditLogQuery.error) {
      return;
    }

    console.error('Failed to fetch audit log:', auditLogQuery.error);
    toast.error(t('auditLogLoadFailed'));
  }, [activeTab, auditLogQuery.error, t]);

  const permissionsByResource = permissions.reduce<Record<string, Permission[]>>((acc, permission) => {
    if (!acc[permission.resource_type]) {
      acc[permission.resource_type] = [];
    }
    acc[permission.resource_type]?.push(permission);
    return acc;
  }, {});

  const resourceOptions = Object.keys(permissionsByResource).toSorted((a, b) => a.localeCompare(b));

  const filteredDialogPermissions = useMemo(() => {
    return permissions.filter((permission) => {
      const matchesSearch =
        permission.name.toLowerCase().includes(permissionSearchQuery.toLowerCase()) ||
        permission.resource_type.toLowerCase().includes(permissionSearchQuery.toLowerCase()) ||
        (permission.description ?? '').toLowerCase().includes(permissionSearchQuery.toLowerCase());
      const matchesResource =
        permissionResourceFilter === 'all' || permission.resource_type === permissionResourceFilter;
      return matchesSearch && matchesResource;
    });
  }, [permissionSearchQuery, permissionResourceFilter, permissions]);

  const filteredDialogPermissionsByResource = filteredDialogPermissions.reduce<Record<string, Permission[]>>(
    (acc, perm) => {
      if (!acc[perm.resource_type]) {
        acc[perm.resource_type] = [];
      }
      acc[perm.resource_type]?.push(perm);
      return acc;
    },
    {},
  );

  const openCreateDialog = () => {
    setRoleDialogMode('create');
    setRoleDialogRole(null);
    setIsRoleDialogOpen(true);
  };

  const openEditDialog = (role: RoleWithPermissions) => {
    setRoleDialogMode('edit');
    setRoleDialogRole(role);
    setIsRoleDialogOpen(true);
  };

  const openCloneDialog = async (role: RoleWithPermissions) => {
    try {
      const source = await loadRoleWithPermissions(role.id);
      setRoleDialogMode('clone');
      setRoleDialogRole({
        ...source,
        id: source.id,
        name: `${source.name} — Copy`,
        slug: `${source.slug}_copy`,
      });
      setIsRoleDialogOpen(true);
    } catch (error) {
      console.error('Failed to load role for cloning:', error);
      toast.error(t('cloneLoadFailed'));
    }
  };

  const handleCreateOrCloneRole = async (data: {
    name: string;
    slug: string;
    description: string;
    priority: number;
  }) => {
    const sourceRole = roleDialogMode === 'clone' ? roleDialogRole : null;

    try {
      const newRole = await apiCreateRole(data);

      if (sourceRole?.permissions?.length) {
        for (const permission of sourceRole.permissions) {
          await addPermissionToRole(newRole.id, permission.id);
        }
      }

      await fetchRoles();
      await refreshSession();
      toast.success(roleDialogMode === 'clone' ? t('cloneSuccess') : t('AddRole.createdNewRole'));
      setIsRoleDialogOpen(false);
      setRoleDialogRole(null);
    } catch (error) {
      console.error('Failed to create role:', error);
      toast.error(error instanceof Error ? error.message : t('AddRole.couldntCreateNewRole'));
    }
  };

  const handleUpdateRole = async (
    roleId: number,
    data: { name: string; slug: string; description: string; priority: number },
  ) => {
    try {
      await apiUpdateRole(roleId, {
        name: data.name,
        description: data.description,
        priority: data.priority,
      });
      await fetchRoles();
      await refreshSession();
      toast.success(t('updatedRole'));
      setIsRoleDialogOpen(false);
      setRoleDialogRole(null);
    } catch (error) {
      console.error('Failed to update role:', error);
      toast.error(error instanceof Error ? error.message : t('EditRole.couldntUpdateRole'));
    }
  };

  const handleDeleteRole = (role: RoleWithPermissions) => {
    setRoleToDelete(role);
  };

  const confirmDeleteRole = async () => {
    if (!roleToDelete) return;

    setDeletingRoleId(roleToDelete.id);
    setRoleToDelete(null);
    try {
      await apiDeleteRole(roleToDelete.id);
      await fetchRoles();
      await refreshSession();
      toast.success(t('deletedRoleSuccess'));
    } catch (error) {
      console.error('Failed to delete role:', error);
      toast.error(error instanceof Error ? error.message : t('deleteRoleError'));
    } finally {
      setDeletingRoleId(null);
    }
  };

  const optimisticTogglePermission = (permission: Permission, grant: boolean) => {
    if (!permissionsRole) return;

    const currentPermissions = permissionsRole.permissions ?? [];
    const updatedPermissions = grant
      ? [...currentPermissions, permission].filter(
          (perm, index, arr) => arr.findIndex((p) => p.id === perm.id) === index,
        )
      : currentPermissions.filter((perm) => perm.id !== permission.id);

    const updatedRole: RoleWithPermissions = {
      ...permissionsRole,
      permissions: updatedPermissions,
      permissions_count: updatedPermissions.length,
    };

    setPermissionsRole(updatedRole);
    mergeRole(updatedRole);
  };

  const refreshPermissionsRole = async (roleId: number) => {
    const refreshed = await loadRoleWithPermissions(roleId);
    setPermissionsRole(refreshed);
    mergeRole(refreshed);
  };

  const handleTogglePermission = async (permission: Permission, hasPermission: boolean) => {
    if (!permissionsRole) return;

    setPendingPermissionIds((prev) => [...prev, permission.id]);
    optimisticTogglePermission(permission, !hasPermission);

    try {
      if (hasPermission) {
        await removePermissionFromRole(permissionsRole.id, permission.id);
      } else {
        await addPermissionToRole(permissionsRole.id, permission.id);
      }

      await refreshPermissionsRole(permissionsRole.id);
      await refreshSession();
      toast.success(hasPermission ? t('permissionRemoved') : t('permissionAdded'));
    } catch (error) {
      console.error('Failed to toggle permission:', error);
      await refreshPermissionsRole(permissionsRole.id);
      toast.error(error instanceof Error ? error.message : t('failedToUpdatePermission'));
    } finally {
      setPendingPermissionIds((prev) => prev.filter((id) => id !== permission.id));
    }
  };

  const handleToggleResourcePermissions = async (resourceType: string, resourcePermissions: Permission[]) => {
    if (!permissionsRole) return;

    setPendingResourceToggles((prev) => [...prev, resourceType]);

    const currentPermissionIds = new Set((permissionsRole.permissions ?? []).map((permission) => permission.id));
    const shouldGrantAll = !resourcePermissions.every((permission) => currentPermissionIds.has(permission.id));

    const nextPermissions = shouldGrantAll
      ? [
          ...(permissionsRole.permissions ?? []),
          ...resourcePermissions.filter((permission) => !currentPermissionIds.has(permission.id)),
        ]
      : (permissionsRole.permissions ?? []).filter(
          (existingPermission) => !resourcePermissions.some((permission) => permission.id === existingPermission.id),
        );

    const optimisticRole = {
      ...permissionsRole,
      permissions: nextPermissions,
      permissions_count: nextPermissions.length,
    };
    setPermissionsRole(optimisticRole);
    mergeRole(optimisticRole);

    try {
      for (const permission of resourcePermissions) {
        const hasPermission = currentPermissionIds.has(permission.id);
        if (shouldGrantAll && !hasPermission) {
          await addPermissionToRole(permissionsRole.id, permission.id);
        }
        if (!shouldGrantAll && hasPermission) {
          await removePermissionFromRole(permissionsRole.id, permission.id);
        }
      }

      await refreshPermissionsRole(permissionsRole.id);
      await refreshSession();
      toast.success(
        shouldGrantAll
          ? t('resourcePermissionsAdded', { resourceType })
          : t('resourcePermissionsRemoved', { resourceType }),
      );
    } catch (error) {
      console.error('Failed to update resource permissions:', error);
      await refreshPermissionsRole(permissionsRole.id);
      toast.error(error instanceof Error ? error.message : t('failedToUpdatePermission'));
    } finally {
      setPendingResourceToggles((prev) => prev.filter((resource) => resource !== resourceType));
    }
  };

  const openPermissionsDialog = async (role: RoleWithPermissions) => {
    setIsPermissionsDialogOpen(true);
    setIsPermissionsDialogLoading(true);
    setPermissionsRole({ ...role, permissions: [] });

    try {
      const detailedRole = await loadRoleWithPermissions(role.id);
      setPermissionsRole(detailedRole);
      mergeRole(detailedRole);
    } catch (error) {
      console.error('Failed to load role permissions:', error);
      toast.error(t('permissionLoadFailed'));
    } finally {
      setIsPermissionsDialogLoading(false);
    }
  };

  const resetPermissionsDialogState = () => {
    setIsPermissionsDialogOpen(false);
    setPermissionsRole(null);
    setPermissionSearchQuery('');
    setPermissionResourceFilter('all');
    setPendingPermissionIds([]);
    setPendingResourceToggles([]);
  };

  const loading = loadingRoles || permissionsLoading;

  const roleColumns: ColumnDef<RoleWithPermissions>[] = [
    {
      accessorFn: (role) => [role.name, role.slug, role.description].filter(Boolean).join(' '),
      id: 'role',
      header: t('tableHead.role'),
      meta: { label: t('tableHead.role'), exportValue: (role) => role.name },
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          {row.original.description ? (
            <div className="text-muted-foreground text-sm">{row.original.description}</div>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'slug',
      header: t('tableHead.slug'),
      meta: { label: t('tableHead.slug') },
      cell: ({ row }) => <code className="bg-muted rounded px-1.5 py-0.5 text-sm">{row.original.slug}</code>,
    },
    {
      accessorFn: (role) => (role.is_system ? t('system') : t('custom')),
      id: 'type',
      header: t('tableHead.type'),
      meta: { label: t('tableHead.type') },
      cell: ({ row }) =>
        row.original.is_system ? (
          <Badge
            variant="secondary"
            className="gap-1"
          >
            <Lock className="h-3 w-3" />
            {t('system')}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="gap-1"
          >
            <Pencil className="h-3 w-3" />
            {t('custom')}
          </Badge>
        ),
    },
    {
      accessorKey: 'priority',
      header: t('tableHead.priority'),
      meta: { label: t('tableHead.priority') },
    },
    {
      accessorFn: (role) => role.permissions_count ?? 0,
      id: 'permissions',
      header: t('tableHead.permissions'),
      meta: { label: t('tableHead.permissions') },
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('permissionsAria', { roleName: row.original.name })}
          onClick={() => openPermissionsDialog(row.original)}
        >
          {t('permissionsCount', { count: row.original.permissions_count ?? 0 })}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      ),
    },
    {
      accessorFn: (role) => role.users_count ?? 0,
      id: 'users',
      header: t('tableHead.users'),
      meta: { label: t('tableHead.users') },
      cell: ({ row }) => row.original.users_count ?? 0,
    },
    {
      id: 'actions',
      header: () => <div className="text-right">{t('tableHead.actions')}</div>,
      enableSorting: false,
      enableHiding: false,
      meta: { label: t('tableHead.actions'), exportable: false },
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <PermissionGuard
            action={Actions.CREATE}
            resource={Resources.ROLE}
            scope={Scopes.PLATFORM}
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('cloneRoleAria', { roleName: row.original.name })}
              onClick={() => openCloneDialog(row.original)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </PermissionGuard>
          <PermissionGuard
            action={Actions.UPDATE}
            resource={Resources.ROLE}
            scope={Scopes.PLATFORM}
          >
            <Button
              variant="ghost"
              size="icon"
              disabled={row.original.is_system && !isSuperAdmin}
              aria-label={t('editRoleAria', { roleName: row.original.name })}
              onClick={() => openEditDialog(row.original)}
            >
              <Edit className="h-4 w-4" />
            </Button>
          </PermissionGuard>
          <PermissionGuard
            action={Actions.DELETE}
            resource={Resources.ROLE}
            scope={Scopes.PLATFORM}
          >
            <Button
              variant="ghost"
              size="icon"
              disabled={(row.original.is_system && !isSuperAdmin) || deletingRoleId === row.original.id}
              aria-label={t('deleteRoleAria', { roleName: row.original.name })}
              onClick={() => handleDeleteRole(row.original)}
            >
              {deletingRoleId === row.original.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </PermissionGuard>
        </div>
      ),
    },
  ];

  const auditColumns: ColumnDef<RoleAuditEvent>[] = [
    {
      accessorKey: 'timestamp',
      header: t('audit.timestamp'),
      cell: ({ row }) => new Date(row.original.timestamp).toLocaleString(),
    },
    {
      accessorFn: (entry) => String(entry.actor_id ?? '—'),
      id: 'actor',
      header: t('audit.actor'),
      cell: ({ row }) => row.original.actor_id ?? '—',
    },
    {
      accessorKey: 'action',
      header: t('audit.action'),
    },
    {
      accessorFn: (entry) => entry.target_role_slug ?? String(entry.target_role_id ?? '—'),
      id: 'role',
      header: t('audit.role'),
      cell: ({ row }) => row.original.target_role_slug ?? row.original.target_role_id ?? '—',
    },
    {
      accessorFn: (entry) => entry.diff_summary ?? '—',
      id: 'summary',
      header: t('audit.summary'),
      cell: ({ row }) => row.original.diff_summary ?? '—',
    },
  ];

  const permissionColumns: ColumnDef<Permission>[] = [
    {
      accessorKey: 'resource_type',
      header: t('permissionTable.resource'),
      meta: { label: t('permissionTable.resource') },
    },
    {
      accessorKey: 'name',
      header: t('permissionTable.code'),
      meta: { label: t('permissionTable.code') },
      cell: ({ row }) => <code className="text-sm">{row.original.name}</code>,
    },
    {
      accessorKey: 'action',
      header: t('permissionTable.action'),
      meta: { label: t('permissionTable.action') },
      cell: ({ row }) => <Badge variant="secondary">{row.original.action}</Badge>,
    },
    {
      accessorKey: 'scope',
      header: t('permissionTable.scope'),
      meta: { label: t('permissionTable.scope') },
      cell: ({ row }) => <Badge variant="outline">{row.original.scope}</Badge>,
    },
    {
      accessorFn: (permission) => permission.description ?? t('noDescription'),
      id: 'description',
      header: t('permissionTable.description'),
      meta: { label: t('permissionTable.description') },
      cell: ({ row }) =>
        row.original.description || <span className="text-muted-foreground">{t('noDescription')}</span>,
    },
  ];

  if (loading) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const totalAuditPages = auditData ? Math.max(1, Math.ceil(auditData.total / auditData.page_size)) : 1;

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('cardDescription')}</p>
        </div>
        <PermissionGuard
          action={Actions.CREATE}
          resource={Resources.ROLE}
          scope={Scopes.PLATFORM}
        >
          <Dialog
            open={isRoleDialogOpen}
            onOpenChange={(open) => {
              setIsRoleDialogOpen(open);
              if (!open) {
                setRoleDialogRole(null);
                setRoleDialogMode('create');
              }
            }}
          >
            <DialogTrigger
              render={
                <Button onClick={openCreateDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('createRole')}
                </Button>
              }
            />
            <DialogContent>
              <RoleEditForm
                mode={roleDialogMode}
                role={roleDialogRole ?? undefined}
                maxPriority={currentUserMaxPriority}
                isSuperAdmin={isSuperAdmin}
                onSubmit={(data) => {
                  if (roleDialogMode === 'edit' && roleDialogRole) {
                    return handleUpdateRole(roleDialogRole.id, data);
                  }
                  return handleCreateOrCloneRole(data);
                }}
                onCancel={() => {
                  setIsRoleDialogOpen(false);
                  setRoleDialogRole(null);
                }}
              />
            </DialogContent>
          </Dialog>
        </PermissionGuard>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('totalRoles')}</CardTitle>
            <Shield className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{roles.length}</div>
            <p className="text-muted-foreground text-xs">
              {roles.filter((r) => r.is_system).length} {t('system')}, {roles.filter((r) => !r.is_system).length}{' '}
              {t('custom')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('permissions')}</CardTitle>
            <Lock className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{permissions.length}</div>
            <p className="text-muted-foreground text-xs">
              {t('acrossResourceTypes', { count: Object.keys(permissionsByResource).length })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('resourceTypes')}</CardTitle>
            <Users className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(permissionsByResource).length}</div>
            <p className="text-muted-foreground text-xs">{t('resourceTypesHint')}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="roles">{t('rolesTab')}</TabsTrigger>
          <TabsTrigger value="permissions">{t('permissionsTab')}</TabsTrigger>
          <TabsTrigger value="audit">{t('auditLogTab')}</TabsTrigger>
        </TabsList>

        <TabsContent
          value="roles"
          className="space-y-4"
        >
          <Card className="p-2">
            <DataTable
              columns={roleColumns}
              data={roles}
              pageSize={10}
              storageKey="rbac-roles"
              enableColumnVisibility
              enableCsvExport
              csvFileName="platform-roles.csv"
              labels={{
                searchPlaceholder: t('searchRolesPlaceholder'),
                emptyMessage: t('loadFailed'),
                columns: t('columns'),
                exportCsv: t('exportCSV'),
                exportStarted: t('exportStarted'),
              }}
            />
          </Card>
        </TabsContent>

        <TabsContent
          value="permissions"
          className="space-y-4"
        >
          <Card>
            <CardHeader>
              <CardTitle>{t('allPermissionsTitle')}</CardTitle>
              <CardDescription>{t('allPermissionsDescription')}</CardDescription>
              <div className="bg-muted text-muted-foreground rounded-md border p-3 text-sm">
                {t('scopeHierarchy')}: <span className="font-medium">all → platform → assigned → own</span>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={permissionColumns}
                data={permissions}
                pageSize={20}
                storageKey="rbac-permissions"
                enableColumnVisibility
                enableCsvExport
                csvFileName="platform-permissions.csv"
                labels={{
                  searchPlaceholder: t('permissionSearchPlaceholder'),
                  emptyMessage: t('noPermissions'),
                  columns: t('columns'),
                  exportCsv: t('exportCSV'),
                  exportStarted: t('exportStarted'),
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="audit"
          className="space-y-4"
        >
          <Card>
            <CardHeader>
              <CardTitle>{t('auditLogTitle')}</CardTitle>
              <CardDescription>{t('auditLogDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isAuditLoading ? (
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('loadingAuditLog')}
                </div>
              ) : (
                <>
                  <DataTable
                    columns={auditColumns}
                    data={auditData?.items ?? []}
                    serverPaginated
                    storageKey="rbac-audit"
                    labels={{
                      searchPlaceholder: t('permissionSearchPlaceholder'),
                      emptyMessage: t('audit.empty'),
                    }}
                  />

                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-sm">
                      {t('audit.pagination', { page: auditPage, totalPages: totalAuditPages })}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={auditPage <= 1}
                        onClick={() => setAuditPage((prev) => Math.max(1, prev - 1))}
                      >
                        {t('previous')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={auditPage >= totalAuditPages}
                        onClick={() => setAuditPage((prev) => Math.min(totalAuditPages, prev + 1))}
                      >
                        {t('next')}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {permissionsRole && (
        <Dialog
          open={isPermissionsDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              resetPermissionsDialogState();
            }
          }}
        >
          <DialogContent className="max-h-[80vh] w-2xl overflow-y-auto lg:min-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('managePermissionsTitle', { roleName: permissionsRole.name })}</DialogTitle>
              <DialogDescription>{t('managePermissionsDescription')}</DialogDescription>
            </DialogHeader>

            {permissionsRole.is_system && !isSuperAdmin && (
              <div className="bg-muted rounded-md border p-3 text-sm">{t('systemRoleReadOnlyBanner')}</div>
            )}

            <div className="flex flex-col gap-3 py-2 md:flex-row">
              <div className="relative flex-1">
                <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
                <Input
                  placeholder={t('permissionSearchPlaceholder')}
                  value={permissionSearchQuery}
                  onChange={(e) => setPermissionSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <NativeSelect
                value={permissionResourceFilter}
                onChange={(event) => setPermissionResourceFilter(event.target.value)}
                className="w-full md:w-56"
                aria-label={t('allResources')}
              >
                <NativeSelectOption value="all">{t('allResources')}</NativeSelectOption>
                {resourceOptions.map((resource) => (
                  <NativeSelectOption
                    key={resource}
                    value={resource}
                  >
                    {resource}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-6 py-2">
              {isPermissionsDialogLoading ? (
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('loadingPermissions')}
                </div>
              ) : (
                Object.entries(filteredDialogPermissionsByResource).map(([resourceType, perms]) => {
                  const rolePermissionIds = new Set((permissionsRole.permissions ?? []).map((p) => p.id));
                  const allSelected = perms.length > 0 && perms.every((perm) => rolePermissionIds.has(perm.id));
                  const isResourcePending = pendingResourceToggles.includes(resourceType);

                  return (
                    <div
                      key={resourceType}
                      className="space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="flex items-center gap-2 font-medium">
                          <Badge variant="outline">{resourceType}</Badge>
                        </h4>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`resource-toggle-${resourceType}`}
                            checked={allSelected}
                            disabled={(permissionsRole.is_system && !isSuperAdmin) || isResourcePending}
                            onCheckedChange={() => handleToggleResourcePermissions(resourceType, perms)}
                          />
                          <label
                            htmlFor={`resource-toggle-${resourceType}`}
                            className="text-sm"
                          >
                            {isResourcePending ? t('updating') : t('selectAllResource')}
                          </label>
                        </div>
                      </div>

                      <div className="ml-4 grid gap-2">
                        {perms.map((perm) => {
                          const hasPermission = rolePermissionIds.has(perm.id);
                          const pending = pendingPermissionIds.includes(perm.id);

                          return (
                            <div
                              key={perm.id}
                              className="flex items-center justify-between rounded border p-2"
                            >
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  id={`perm-${perm.id}`}
                                  checked={hasPermission}
                                  disabled={(permissionsRole.is_system && !isSuperAdmin) || pending}
                                  onCheckedChange={() => handleTogglePermission(perm, hasPermission)}
                                />
                                <label
                                  htmlFor={`perm-${perm.id}`}
                                  className="cursor-pointer text-sm"
                                >
                                  <span className="block">{perm.name}</span>
                                  {perm.description && (
                                    <span className="text-muted-foreground block text-xs">{perm.description}</span>
                                  )}
                                </label>
                              </div>
                              <div className="flex items-center gap-2">
                                {pending && <Loader2 className="text-muted-foreground h-3.5 w-3.5 animate-spin" />}
                                <Badge
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {perm.action}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {perm.scope}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}

              {!isPermissionsDialogLoading && Object.keys(filteredDialogPermissionsByResource).length === 0 && (
                <p className="text-muted-foreground text-sm">{t('noPermissionsFound')}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={resetPermissionsDialogState}
              >
                {t('done')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog
        open={roleToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setRoleToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20">
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('deleteRoleAria', { roleName: roleToDelete?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteRoleConfirmationWithUsers', { count: roleToDelete?.users_count ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDeleteRole}
            >
              {t('deleteRoleConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RoleEditForm({
  mode,
  role,
  maxPriority,
  isSuperAdmin,
  onSubmit,
  onCancel,
}: {
  mode: RoleDialogMode;
  role?: RoleWithPermissions;
  maxPriority: number;
  isSuperAdmin: boolean;
  onSubmit: (data: { name: string; slug: string; description: string; priority: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations('Components.Roles');
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [priority, setPriority] = useState(role?.priority ?? 0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditMode = mode === 'edit';

  const autoSlug = isEditMode
    ? (role?.slug ?? '')
    : name
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');

  const [slug, setSlug] = useState(role?.slug ?? autoSlug);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!isEditMode) {
      setSlug(
        value
          .toLowerCase()
          .replace(/\s+/g, '_')
          .replace(/[^a-z0-9_]/g, ''),
      );
    }
  };

  const handleSubmit = async (formData: FormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        name: String(formData.get('name') ?? name).trim(),
        slug: String(formData.get('slug') ?? slug).trim(),
        description: String(formData.get('description') ?? description).trim(),
        priority: Number(formData.get('priority') ?? priority),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form action={handleSubmit}>
      <DialogHeader>
        <DialogTitle>
          {mode === 'edit' ? t('editRoleTitle') : mode === 'clone' ? t('cloneRoleTitle') : t('createRoleTitle')}
        </DialogTitle>
        <DialogDescription>
          {mode === 'edit'
            ? t('editRoleDescription')
            : mode === 'clone'
              ? t('cloneRoleDescription')
              : t('createRoleDescription')}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="name">{t('fieldName')}</Label>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={t('namePlaceholder')}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="slug">{t('fieldSlug')}</Label>
          {isEditMode && (
            <input
              type="hidden"
              name="slug"
              value={slug}
            />
          )}
          <Input
            id="slug"
            name="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={t('slugPlaceholder')}
            disabled={isEditMode}
            required
          />
          <p className="text-muted-foreground text-xs">{isEditMode ? t('slugImmutableHelp') : t('slugCreateHelp')}</p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="priority">{t('tableHead.priority')}</Label>
          <Input
            id="priority"
            name="priority"
            type="number"
            min={0}
            max={isSuperAdmin ? undefined : maxPriority}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value || 0))}
            required
          />
          {!isSuperAdmin && (
            <p className="text-muted-foreground text-xs">{t('priorityMaxHelp', { max: maxPriority })}</p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="description">{t('fieldDescription')}</Label>
          <Input
            id="description"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('descriptionPlaceholder')}
          />
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {t('AddRole.cancel')}
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === 'edit' ? t('updateRole') : mode === 'clone' ? t('cloneRole') : t('createRole')}
        </Button>
      </DialogFooter>
    </form>
  );
}
