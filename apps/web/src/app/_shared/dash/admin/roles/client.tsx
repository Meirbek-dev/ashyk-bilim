'use client'

import {
  addPermissionToRole,
  createRole as apiCreateRole,
  deleteRole as apiDeleteRole,
  getRole as apiGetRole,
  updateRole as apiUpdateRole,
  getRolePermissions,
  removePermissionFromRole,
} from '@/services/rbac'
import { usePlatformPermissions } from '@/features/platform/hooks/usePlatform'
import { useRoleAuditLog, useRoles } from '@/features/users/hooks/useUsers'
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
} from '@/components/ui/alert-dialog'
import { AlertTriangle, Loader2, Lock, Plus, Shield, Users } from 'lucide-react'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Actions, PermissionGuard, Resources, Scopes } from '@/components/Security'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSession } from '@/hooks/useSession'
import type { Permission, RoleAuditEvent, RoleWithPermissions } from '@/types/permissions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import DataTable from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

// Extracted Components & Helper Columns
import { getRoleColumns, getAuditColumns, getPermissionColumns } from './components/columns'
import { RoleEditForm } from './components/RoleEditForm'
import { PermissionsDialog } from './components/PermissionsDialog'

type RoleDialogMode = 'create' | 'edit' | 'clone'

const EMPTY_ROLES: RoleWithPermissions[] = []
const EMPTY_PERMISSIONS: Permission[] = []

const emptySubscribe = () => () => {}

const loadRoleWithPermissions = async (roleId: number): Promise<RoleWithPermissions> => {
  const [role, rolePermissions] = await Promise.all([apiGetRole(roleId), getRolePermissions(roleId)])

  return {
    ...role,
    permissions: rolePermissions,
    permissions_count: rolePermissions.length,
  }
}

export default function RBACAdminClient() {
  const session = useSession()
  const { can } = session
  const t = useTranslations('Components.Roles')
  const router = useRouter()

  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
  const [activeTab, setActiveTab] = useState('roles')

  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false)
  const [roleDialogMode, setRoleDialogMode] = useState<RoleDialogMode>('create')
  const [roleDialogRole, setRoleDialogRole] = useState<RoleWithPermissions | null>(null)

  const [permissionsRole, setPermissionsRole] = useState<RoleWithPermissions | null>(null)
  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false)
  const [isPermissionsDialogLoading, setIsPermissionsDialogLoading] = useState(false)
  const [pendingPermissionIds, setPendingPermissionIds] = useState<number[]>([])
  const [pendingResourceToggles, setPendingResourceToggles] = useState<string[]>([])

  const [deletingRoleId, setDeletingRoleId] = useState<number | null>(null)
  const [roleToDelete, setRoleToDelete] = useState<RoleWithPermissions | null>(null)

  const [auditPage, setAuditPage] = useState(1)
  const isSuperAdmin = can(Resources.ROLE, Actions.MANAGE, Scopes.ALL)
  const currentUserMaxPriority = useMemo(() => {
    const sessionRoles = session.session?.roles ?? []
    return sessionRoles.reduce(
      (maxPriority: number, assignment: (typeof sessionRoles)[number]) =>
        Math.max(maxPriority, assignment.role?.priority ?? 0),
      0,
    )
  }, [session.session?.roles])

  const {
    data: permissions = EMPTY_PERMISSIONS,
    isLoading: permissionsLoading,
    error: permissionsError,
  } = usePlatformPermissions()
  const {
    data: fetchedRoles = EMPTY_ROLES,
    isLoading: loadingRoles,
    error: rolesError,
    refetch: refetchRoles,
  } = useRoles()

  const [prevFetchedRoles, setPrevFetchedRoles] = useState(fetchedRoles)
  const [roles, setRoles] = useState<RoleWithPermissions[]>(() =>
    fetchedRoles
      .toSorted((a, b) => {
        const aSystem = a.is_system ? 0 : 1
        const bSystem = b.is_system ? 0 : 1
        if (aSystem !== bSystem) return aSystem - bSystem
        return (b.priority ?? 0) - (a.priority ?? 0)
      })
      .map(role => Object.assign(role, { permissions: [] })),
  )

  if (fetchedRoles !== prevFetchedRoles) {
    setPrevFetchedRoles(fetchedRoles)
    setRoles(
      fetchedRoles
        .toSorted((a, b) => {
          const aSystem = a.is_system ? 0 : 1
          const bSystem = b.is_system ? 0 : 1
          if (aSystem !== bSystem) return aSystem - bSystem
          return (b.priority ?? 0) - (a.priority ?? 0)
        })
        .map(role => Object.assign(role, { permissions: [] })),
    )
  }
  const auditLogQuery = useRoleAuditLog(auditPage, 20, {
    enabled: activeTab === 'audit',
  })
  const auditData = useMemo(() => {
    if (!auditLogQuery.data) {
      return null
    }

    return {
      items: Array.isArray(auditLogQuery.data.items) ? auditLogQuery.data.items : [],
      total: typeof auditLogQuery.data.total === 'number' ? auditLogQuery.data.total : 0,
      page_size:
        typeof auditLogQuery.data.page_size === 'number' && auditLogQuery.data.page_size > 0
          ? auditLogQuery.data.page_size
          : 20,
    } satisfies {
      items: RoleAuditEvent[]
      total: number
      page_size: number
    }
  }, [auditLogQuery.data])
  const isAuditLoading = activeTab === 'audit' && (auditLogQuery.isLoading || auditLogQuery.isFetching)

  const fetchRoles = useCallback(async () => {
    const result = await refetchRoles()
    if (result.error) {
      throw result.error
    }
  }, [refetchRoles])

  const refreshSession = useCallback(async () => {
    router.refresh()
    if (!session.user) toast.warning(t('sessionRefreshWarning'))
  }, [router, session.user, t])

  const mergeRole = useCallback((updated: RoleWithPermissions) => {
    setRoles(prev =>
      prev.map(role =>
        role.id === updated.id
          ? {
              ...role,
              ...updated,
              permissions: updated.permissions,
              permissions_count: updated.permissions.length,
            }
          : role,
      ),
    )
  }, [])

  useEffect(() => {
    if (permissionsError) {
      toast.error(t('loadFailed'))
    }
  }, [permissionsError, t])

  useEffect(() => {
    if (rolesError) {
      console.error('Failed to fetch RBAC roles:', rolesError)
      toast.error(t('loadFailed'))
    }
  }, [rolesError, t])

  useEffect(() => {
    if (activeTab !== 'audit' || !auditLogQuery.error) {
      return
    }

    console.error('Failed to fetch audit log:', auditLogQuery.error)
    toast.error(t('auditLogLoadFailed'))
  }, [activeTab, auditLogQuery.error, t])

  const permissionsByResource = useMemo(() => {
    return permissions.reduce<Record<string, Permission[]>>((acc, permission) => {
      if (!acc[permission.resource_type]) {
        acc[permission.resource_type] = []
      }
      acc[permission.resource_type]?.push(permission)
      return acc
    }, {})
  }, [permissions])

  const openCreateDialog = () => {
    setRoleDialogMode('create')
    setRoleDialogRole(null)
    setIsRoleDialogOpen(true)
  }

  const openEditDialog = useCallback((role: RoleWithPermissions) => {
    setRoleDialogMode('edit')
    setRoleDialogRole(role)
    setIsRoleDialogOpen(true)
  }, [])

  const openCloneDialog = useCallback(
    async (role: RoleWithPermissions) => {
      try {
        const source = await loadRoleWithPermissions(role.id)
        setRoleDialogMode('clone')
        setRoleDialogRole({
          ...source,
          id: source.id,
          name: `${source.name} — Copy`,
          slug: `${source.slug}_copy`,
        })
        setIsRoleDialogOpen(true)
      } catch (error) {
        console.error('Failed to load role for cloning:', error)
        toast.error(t('cloneLoadFailed'))
      }
    },
    [t],
  )

  const handleCreateOrCloneRole = async (data: {
    name: string
    slug: string
    description: string
    priority: number
  }) => {
    const sourceRole = roleDialogMode === 'clone' ? roleDialogRole : null

    try {
      const newRole = await apiCreateRole(data)

      if (sourceRole?.permissions?.length) {
        for (const permission of sourceRole.permissions) {
          await addPermissionToRole(newRole.id, permission.id)
        }
      }

      await fetchRoles()
      await refreshSession()
      toast.success(roleDialogMode === 'clone' ? t('cloneSuccess') : t('AddRole.createdNewRole'))
      setIsRoleDialogOpen(false)
      setRoleDialogRole(null)
    } catch (error) {
      console.error('Failed to create role:', error)
      toast.error(error instanceof Error ? error.message : t('AddRole.couldntCreateNewRole'))
    }
  }

  const handleUpdateRole = async (
    roleId: number,
    data: { name: string; slug: string; description: string; priority: number },
  ) => {
    try {
      await apiUpdateRole(roleId, {
        name: data.name,
        description: data.description,
        priority: data.priority,
      })
      await fetchRoles()
      await refreshSession()
      toast.success(t('updatedRole'))
      setIsRoleDialogOpen(false)
      setRoleDialogRole(null)
    } catch (error) {
      console.error('Failed to update role:', error)
      toast.error(error instanceof Error ? error.message : t('EditRole.couldntUpdateRole'))
    }
  }

  const handleDeleteRole = useCallback((role: RoleWithPermissions) => {
    setRoleToDelete(role)
  }, [])

  const confirmDeleteRole = async () => {
    if (!roleToDelete) return

    setDeletingRoleId(roleToDelete.id)
    setRoleToDelete(null)
    try {
      await apiDeleteRole(roleToDelete.id)
      await fetchRoles()
      await refreshSession()
      toast.success(t('deletedRoleSuccess'))
    } catch (error) {
      console.error('Failed to delete role:', error)
      toast.error(error instanceof Error ? error.message : t('deleteRoleError'))
    } finally {
      setDeletingRoleId(null)
    }
  }

  const optimisticTogglePermission = (permission: Permission, grant: boolean) => {
    if (!permissionsRole) return

    const currentPermissions = permissionsRole.permissions ?? []
    const updatedPermissions = grant
      ? [...currentPermissions, permission].filter((perm, index, arr) => arr.findIndex(p => p.id === perm.id) === index)
      : currentPermissions.filter(perm => perm.id !== permission.id)

    const updatedRole: RoleWithPermissions = {
      ...permissionsRole,
      permissions: updatedPermissions,
      permissions_count: updatedPermissions.length,
    }

    setPermissionsRole(updatedRole)
    mergeRole(updatedRole)
  }

  const refreshPermissionsRole = async (roleId: number) => {
    const refreshed = await loadRoleWithPermissions(roleId)
    setPermissionsRole(refreshed)
    mergeRole(refreshed)
  }

  const handleTogglePermission = async (permission: Permission, hasPermission: boolean) => {
    if (!permissionsRole) return

    setPendingPermissionIds(prev => [...prev, permission.id])
    optimisticTogglePermission(permission, !hasPermission)

    try {
      if (hasPermission) {
        await removePermissionFromRole(permissionsRole.id, permission.id)
      } else {
        await addPermissionToRole(permissionsRole.id, permission.id)
      }

      await refreshPermissionsRole(permissionsRole.id)
      await refreshSession()
      toast.success(hasPermission ? t('permissionRemoved') : t('permissionAdded'))
    } catch (error) {
      console.error('Failed to toggle permission:', error)
      await refreshPermissionsRole(permissionsRole.id)
      toast.error(error instanceof Error ? error.message : t('failedToUpdatePermission'))
    } finally {
      setPendingPermissionIds(prev => prev.filter(id => id !== permission.id))
    }
  }

  const handleToggleResourcePermissions = async (resourceType: string, resourcePermissions: Permission[]) => {
    if (!permissionsRole) return

    setPendingResourceToggles(prev => [...prev, resourceType])

    const currentPermissionIds = new Set((permissionsRole.permissions ?? []).map(permission => permission.id))
    const shouldGrantAll = !resourcePermissions.every(permission => currentPermissionIds.has(permission.id))

    const nextPermissions = shouldGrantAll
      ? [
          ...(permissionsRole.permissions ?? []),
          ...resourcePermissions.filter(permission => !currentPermissionIds.has(permission.id)),
        ]
      : (permissionsRole.permissions ?? []).filter(
          existingPermission => !resourcePermissions.some(permission => permission.id === existingPermission.id),
        )

    const optimisticRole = {
      ...permissionsRole,
      permissions: nextPermissions,
      permissions_count: nextPermissions.length,
    }
    setPermissionsRole(optimisticRole)
    mergeRole(optimisticRole)

    try {
      for (const permission of resourcePermissions) {
        const hasPermission = currentPermissionIds.has(permission.id)
        if (shouldGrantAll && !hasPermission) {
          await addPermissionToRole(permissionsRole.id, permission.id)
        }
        if (!shouldGrantAll && hasPermission) {
          await removePermissionFromRole(permissionsRole.id, permission.id)
        }
      }

      await refreshPermissionsRole(permissionsRole.id)
      await refreshSession()
      toast.success(
        shouldGrantAll
          ? t('resourcePermissionsAdded', { resourceType })
          : t('resourcePermissionsRemoved', { resourceType }),
      )
    } catch (error) {
      console.error('Failed to update resource permissions:', error)
      await refreshPermissionsRole(permissionsRole.id)
      toast.error(error instanceof Error ? error.message : t('failedToUpdatePermission'))
    } finally {
      setPendingResourceToggles(prev => prev.filter(resource => resource !== resourceType))
    }
  }

  const openPermissionsDialog = useCallback(
    async (role: RoleWithPermissions) => {
      setIsPermissionsDialogOpen(true)
      setIsPermissionsDialogLoading(true)
      setPermissionsRole({ ...role, permissions: [] })

      try {
        const detailedRole = await loadRoleWithPermissions(role.id)
        setPermissionsRole(detailedRole)
        mergeRole(detailedRole)
      } catch (error) {
        console.error('Failed to load role permissions:', error)
        toast.error(t('permissionLoadFailed'))
      } finally {
        setIsPermissionsDialogLoading(false)
      }
    },
    [t, mergeRole],
  )

  const resetPermissionsDialogState = () => {
    setIsPermissionsDialogOpen(false)
    setPermissionsRole(null)
    setPendingPermissionIds([])
    setPendingResourceToggles([])
  }

  const loading = !isMounted || loadingRoles || permissionsLoading

  const roleColumns = useMemo(
    () =>
      getRoleColumns({
        t,
        isSuperAdmin,
        deletingRoleId,
        openCloneDialog,
        openEditDialog,
        handleDeleteRole,
        openPermissionsDialog,
      }),
    [t, isSuperAdmin, deletingRoleId, openCloneDialog, openEditDialog, handleDeleteRole, openPermissionsDialog],
  )

  const auditColumns = useMemo(() => getAuditColumns(t), [t])
  const permissionColumns = useMemo(() => getPermissionColumns(t), [t])

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
    )
  }

  const totalAuditPages = auditData ? Math.max(1, Math.ceil(auditData.total / auditData.page_size)) : 1

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('cardDescription')}</p>
        </div>
        <PermissionGuard action={Actions.CREATE} resource={Resources.ROLE} scope={Scopes.APP}>
          <Dialog
            open={isRoleDialogOpen}
            onOpenChange={open => {
              setIsRoleDialogOpen(open)
              if (!open) {
                setRoleDialogRole(null)
                setRoleDialogMode('create')
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
                {...(roleDialogRole ? { role: roleDialogRole } : {})}
                maxPriority={currentUserMaxPriority}
                isSuperAdmin={isSuperAdmin}
                onSubmit={async data => {
                  if (roleDialogMode === 'edit' && roleDialogRole) {
                    await handleUpdateRole(roleDialogRole.id, data)
                  } else {
                    await handleCreateOrCloneRole(data)
                  }
                }}
                onCancel={() => {
                  setIsRoleDialogOpen(false)
                  setRoleDialogRole(null)
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
              {roles.filter(r => r.is_system).length} {t('system')}, {roles.filter(r => !r.is_system).length}{' '}
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
              {t('acrossResourceTypes', {
                count: Object.keys(permissionsByResource).length,
              })}
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="roles">{t('rolesTab')}</TabsTrigger>
          <TabsTrigger value="permissions">{t('permissionsTab')}</TabsTrigger>
          <TabsTrigger value="audit">{t('auditLogTab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="space-y-4">
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

        <TabsContent value="permissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('allPermissionsTitle')}</CardTitle>
              <CardDescription>{t('allPermissionsDescription')}</CardDescription>
              <div className="bg-muted text-muted-foreground rounded-md border p-3 text-sm">
                {t('scopeHierarchy')}: <span className="font-medium">{t('scopeHierarchyValue')}</span>
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

        <TabsContent value="audit" className="space-y-4">
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
                      {t('audit.pagination', {
                        page: auditPage,
                        totalPages: totalAuditPages,
                      })}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={auditPage <= 1}
                        onClick={() => setAuditPage(prev => Math.max(1, prev - 1))}
                      >
                        {t('previous')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={auditPage >= totalAuditPages}
                        onClick={() => setAuditPage(prev => Math.min(totalAuditPages, prev + 1))}
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
        <PermissionsDialog
          isOpen={isPermissionsDialogOpen}
          role={permissionsRole}
          isSuperAdmin={isSuperAdmin}
          permissions={permissions}
          isPermissionsDialogLoading={isPermissionsDialogLoading}
          pendingPermissionIds={pendingPermissionIds}
          pendingResourceToggles={pendingResourceToggles}
          handleTogglePermission={handleTogglePermission}
          handleToggleResourcePermissions={handleToggleResourcePermissions}
          onClose={resetPermissionsDialogState}
        />
      )}

      <AlertDialog
        open={roleToDelete !== null}
        onOpenChange={open => {
          if (!open) setRoleToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20">
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('deleteRoleAria', { roleName: roleToDelete?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteRoleConfirmationWithUsers', {
                count: roleToDelete?.users_count ?? 0,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction variant="destructive" onClick={confirmDeleteRole}>
              {t('deleteRoleConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
