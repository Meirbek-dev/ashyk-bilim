import { ChevronRight, Copy, Edit, Loader2, Lock, Pencil, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Actions, PermissionGuard, Resources, Scopes } from '@/components/Security'
import type { DataTableColumnDef } from '@/components/ui/data-table'
import type { Permission, RoleAuditEvent, RoleWithPermissions } from '@/types/permissions'

interface GetRoleColumnsParams {
  t: AppTranslator
  isSuperAdmin: boolean
  deletingRoleId: number | null
  openCloneDialog: (role: RoleWithPermissions) => void
  openEditDialog: (role: RoleWithPermissions) => void
  handleDeleteRole: (role: RoleWithPermissions) => void
  openPermissionsDialog: (role: RoleWithPermissions) => void
}

export function getRoleColumns({
  t,
  isSuperAdmin,
  deletingRoleId,
  openCloneDialog,
  openEditDialog,
  handleDeleteRole,
  openPermissionsDialog,
}: GetRoleColumnsParams): DataTableColumnDef<RoleWithPermissions>[] {
  return [
    {
      accessorFn: role => [role.name, role.slug, role.description].filter(Boolean).join(' '),
      id: 'role',
      header: t('tableHead.role'),
      meta: { label: t('tableHead.role'), exportValue: role => role.name },
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
      accessorFn: role => (role.is_system ? t('system') : t('custom')),
      id: 'type',
      header: t('tableHead.type'),
      meta: { label: t('tableHead.type') },
      cell: ({ row }) =>
        row.original.is_system ? (
          <Badge variant="secondary" className="gap-1">
            <Lock className="h-3 w-3" />
            {t('system')}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
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
      accessorFn: role => role.permissions_count ?? 0,
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
      accessorFn: role => role.users_count ?? 0,
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
          <PermissionGuard action={Actions.CREATE} resource={Resources.ROLE} scope={Scopes.APP}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('cloneRoleAria', { roleName: row.original.name })}
              onClick={() => openCloneDialog(row.original)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </PermissionGuard>
          <PermissionGuard action={Actions.UPDATE} resource={Resources.ROLE} scope={Scopes.APP}>
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
          <PermissionGuard action={Actions.DELETE} resource={Resources.ROLE} scope={Scopes.APP}>
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
  ]
}

export function getAuditColumns(t: AppTranslator): DataTableColumnDef<RoleAuditEvent>[] {
  return [
    {
      accessorKey: 'timestamp',
      header: t('audit.timestamp'),
      cell: ({ row }) => new Date(row.original.timestamp).toLocaleString(),
    },
    {
      accessorFn: entry => String(entry.actor_id ?? '—'),
      id: 'actor',
      header: t('audit.actor'),
      cell: ({ row }) => row.original.actor_id ?? '—',
    },
    {
      accessorKey: 'action',
      header: t('audit.action'),
    },
    {
      accessorFn: entry => entry.target_role_slug ?? String(entry.target_role_id ?? '—'),
      id: 'role',
      header: t('audit.role'),
      cell: ({ row }) => row.original.target_role_slug ?? row.original.target_role_id ?? '—',
    },
    {
      accessorFn: entry => entry.diff_summary ?? '—',
      id: 'summary',
      header: t('audit.summary'),
      cell: ({ row }) => row.original.diff_summary ?? '—',
    },
  ]
}

export function getPermissionColumns(t: AppTranslator): DataTableColumnDef<Permission>[] {
  return [
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
      accessorFn: permission => permission.description ?? t('noDescription'),
      id: 'description',
      header: t('permissionTable.description'),
      meta: { label: t('permissionTable.description') },
      cell: ({ row }) =>
        row.original.description || <span className="text-muted-foreground">{t('noDescription')}</span>,
    },
  ]
}
