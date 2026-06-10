import { useState, useMemo } from 'react'
import { Loader2, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { Permission, RoleWithPermissions } from '@/types/permissions'

interface PermissionsDialogProps {
  isOpen: boolean
  role: RoleWithPermissions
  isSuperAdmin: boolean
  permissions: Permission[]
  isPermissionsDialogLoading: boolean
  pendingPermissionIds: number[]
  pendingResourceToggles: string[]
  handleTogglePermission: (permission: Permission, hasPermission: boolean) => Promise<void>
  handleToggleResourcePermissions: (resourceType: string, resourcePermissions: Permission[]) => Promise<void>
  onClose: () => void
}

export function PermissionsDialog({
  isOpen,
  role,
  isSuperAdmin,
  permissions,
  isPermissionsDialogLoading,
  pendingPermissionIds,
  pendingResourceToggles,
  handleTogglePermission,
  handleToggleResourcePermissions,
  onClose,
}: PermissionsDialogProps) {
  const t = useTranslations('Components.Roles')
  const [permissionSearchQuery, setPermissionSearchQuery] = useState('')
  const [permissionResourceFilter, setPermissionResourceFilter] = useState('all')

  const permissionsByResource = useMemo(() => {
    return permissions.reduce<Record<string, Permission[]>>((acc, permission) => {
      if (!acc[permission.resource_type]) {
        acc[permission.resource_type] = []
      }
      acc[permission.resource_type]?.push(permission)
      return acc
    }, {})
  }, [permissions])

  const resourceOptions = useMemo(() => {
    return Object.keys(permissionsByResource).toSorted((a, b) => a.localeCompare(b))
  }, [permissionsByResource])

  const filteredDialogPermissions = useMemo(() => {
    return permissions.filter(permission => {
      const matchesSearch =
        permission.name.toLowerCase().includes(permissionSearchQuery.toLowerCase()) ||
        permission.resource_type.toLowerCase().includes(permissionSearchQuery.toLowerCase()) ||
        (permission.description ?? '').toLowerCase().includes(permissionSearchQuery.toLowerCase())
      const matchesResource =
        permissionResourceFilter === 'all' || permission.resource_type === permissionResourceFilter
      return matchesSearch && matchesResource
    })
  }, [permissionSearchQuery, permissionResourceFilter, permissions])

  const filteredDialogPermissionsByResource = useMemo(() => {
    return filteredDialogPermissions.reduce<Record<string, Permission[]>>((acc, perm) => {
      if (!acc[perm.resource_type]) {
        acc[perm.resource_type] = []
      }
      acc[perm.resource_type]?.push(perm)
      return acc
    }, {})
  }, [filteredDialogPermissions])

  const handleClose = () => {
    setPermissionSearchQuery('')
    setPermissionResourceFilter('all')
    onClose()
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        if (!open) {
          handleClose()
        }
      }}
    >
      <DialogContent className="max-h-[80vh] w-2xl overflow-y-auto lg:min-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('managePermissionsTitle', { roleName: role.name })}</DialogTitle>
          <DialogDescription>{t('managePermissionsDescription')}</DialogDescription>
        </DialogHeader>

        {role.is_system && !isSuperAdmin && (
          <div className="bg-muted rounded-md border p-3 text-sm">{t('systemRoleReadOnlyBanner')}</div>
        )}

        <div className="flex flex-col gap-3 py-2 md:flex-row">
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
            <Input
              placeholder={t('permissionSearchPlaceholder')}
              value={permissionSearchQuery}
              onChange={e => setPermissionSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <NativeSelect
            value={permissionResourceFilter}
            onChange={event => setPermissionResourceFilter(event.target.value)}
            className="w-full md:w-56"
            aria-label={t('allResources')}
          >
            <NativeSelectOption value="all">{t('allResources')}</NativeSelectOption>
            {resourceOptions.map(resource => (
              <NativeSelectOption key={resource} value={resource}>
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
              const rolePermissionIds = new Set((role.permissions ?? []).map(p => p.id))
              const allSelected = perms.length > 0 && perms.every(perm => rolePermissionIds.has(perm.id))
              const isResourcePending = pendingResourceToggles.includes(resourceType)

              return (
                <div key={resourceType} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="flex items-center gap-2 font-medium">
                      <Badge variant="outline">{resourceType}</Badge>
                    </h4>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`resource-toggle-${resourceType}`}
                        checked={allSelected}
                        disabled={(role.is_system && !isSuperAdmin) || isResourcePending}
                        onCheckedChange={() => handleToggleResourcePermissions(resourceType, perms)}
                      />
                      <label htmlFor={`resource-toggle-${resourceType}`} className="text-sm">
                        {isResourcePending ? t('updating') : t('selectAllResource')}
                      </label>
                    </div>
                  </div>

                  <div className="ml-4 grid gap-2">
                    {perms.map(perm => {
                      const hasPermission = rolePermissionIds.has(perm.id)
                      const pending = pendingPermissionIds.includes(perm.id)

                      return (
                        <div key={perm.id} className="flex items-center justify-between rounded border p-2">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={`perm-${perm.id}`}
                              checked={hasPermission}
                              disabled={(role.is_system && !isSuperAdmin) || pending}
                              onCheckedChange={() => handleTogglePermission(perm, hasPermission)}
                            />
                            <label htmlFor={`perm-${perm.id}`} className="cursor-pointer text-sm">
                              <span className="block">{perm.name}</span>
                              {perm.description && (
                                <span className="text-muted-foreground block text-xs">{perm.description}</span>
                              )}
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            {pending && <Loader2 className="text-muted-foreground h-3.5 w-3.5 animate-spin" />}
                            <Badge variant="secondary" className="text-xs">
                              {perm.action}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {perm.scope}
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}

          {!isPermissionsDialogLoading && Object.keys(filteredDialogPermissionsByResource).length === 0 && (
            <p className="text-muted-foreground text-sm">{t('noPermissionsFound')}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
