'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { AlertTriangle, KeyRound, Lock, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Actions, Resources, Scopes } from '@/components/Security'
import { useRoles } from '@/features/users/hooks/useUsers'
import { useRoleLabels } from '@/features/users/hooks/useRoleLabels'
import { useApiError } from '@/hooks/useApiError'
import { useSession } from '@/hooks/useSession'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import type { Role } from '@/lib/api/generated/zod'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { createRole, deleteRole, setRolePermissions, updateRole } from '@/services/rbac'
import { GRANT_PATTERN, KNOWN_GRANTS } from '@/types/permissions'

type RoleDraft = { slug: string; display_name: string; description: string; priority: number }

/** Every role mutation: localized toast, dialogs closed, role list refetched; errors go through problem+json. */
function useRoleMutation<TVars>(
  mutationFn: (vars: TVars) => Promise<void>,
  messages: { success: string; conflict?: string },
  onDone: () => void,
) {
  const queryClient = useQueryClient()
  const { toastApiError } = useApiError()
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      toast.success(messages.success)
      onDone()
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.roles() })
    },
    onError: error => {
      // The registry only has a generic `conflict`; the one 409 each endpoint can answer is known, so name it.
      if (messages.conflict && hasErrorCode(error, 'conflict')) toast.error(messages.conflict)
      else toastApiError(error)
    },
  })
}

export default function RBACAdminClient() {
  const t = useTranslations('Components.Roles')
  const { can } = useSession()
  const canManage = can(Resources.ROLE, Actions.MANAGE, Scopes.APP)
  const { data, isPending, isError } = useRoles()
  const roles = useMemo(
    () => (data ?? []).toSorted((a, b) => Number(b.is_system) - Number(a.is_system) || b.priority - a.priority),
    [data],
  )
  const { roleName, roleDescription } = useRoleLabels(roles)

  const [editing, setEditing] = useState<Role | 'new' | null>(null)
  const [grantsFor, setGrantsFor] = useState<Role | null>(null)
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null)
  const closeDialogs = () => {
    setEditing(null)
    setGrantsFor(null)
  }

  const create = useRoleMutation(
    (draft: RoleDraft) => createRole(draft),
    { success: t('createdRole'), conflict: t('slugTaken') },
    closeDialogs,
  )
  const update = useRoleMutation(
    ({ slug, ...body }: RoleDraft) => updateRole(slug, body),
    { success: t('updatedRole') },
    closeDialogs,
  )
  const remove = useRoleMutation((slug: string) => deleteRole(slug), { success: t('deletedRole') }, closeDialogs)
  const saveGrants = useRoleMutation(
    ({ slug, permissions }: { slug: string; permissions: string[] }) => setRolePermissions(slug, permissions),
    { success: t('permissionsSaved') },
    closeDialogs,
  )

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('cardDescription')}</p>
        </div>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="mr-2 h-4 w-4" />
            {t('createRole')}
          </Button>
        )}
      </div>

      <Card className="p-4">
        {isError ? (
          <p className="text-destructive text-sm">{t('loadFailed')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('tableHead.role')}</TableHead>
                <TableHead>{t('tableHead.slug')}</TableHead>
                <TableHead>{t('tableHead.type')}</TableHead>
                <TableHead>{t('tableHead.priority')}</TableHead>
                <TableHead>{t('tableHead.permissions')}</TableHead>
                {canManage && <TableHead className="text-right">{t('tableHead.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ) : (
                roles.map(role => (
                  <TableRow key={role.slug}>
                    <TableCell>
                      <div className="font-medium">{roleName(role)}</div>
                      {roleDescription(role) && (
                        <div className="text-muted-foreground text-xs">{roleDescription(role)}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <code className="bg-muted rounded px-1.5 py-0.5 text-xs">{role.slug}</code>
                    </TableCell>
                    <TableCell>
                      {role.is_system ? (
                        <Badge variant="secondary" className="gap-1">
                          <Lock className="h-3 w-3" />
                          {t('system')}
                        </Badge>
                      ) : (
                        <Badge variant="outline">{t('custom')}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{role.priority}</TableCell>
                    <TableCell>
                      <details>
                        <summary className="cursor-pointer text-sm">
                          {t('grantsCount', { count: role.permissions.length })}
                        </summary>
                        <div className="mt-2 flex max-w-md flex-wrap gap-1">
                          {role.permissions.map(grant => (
                            <code key={grant} className="bg-muted rounded px-1.5 py-0.5 text-xs">
                              {grant}
                            </code>
                          ))}
                        </div>
                      </details>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {role.is_system ? (
                          <span className="text-muted-foreground text-xs">{t('systemRoleReadOnly')}</span>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t('editRoleAria', { roleName: roleName(role) })}
                              onClick={() => setEditing(role)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t('permissionsAria', { roleName: roleName(role) })}
                              onClick={() => setGrantsFor(role)}
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t('deleteRoleAria', { roleName: roleName(role) })}
                              onClick={() => setRoleToDelete(role)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={editing !== null} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing && (
            <RoleForm
              role={editing === 'new' ? null : editing}
              initialName={editing === 'new' ? '' : roleName(editing)}
              initialDescription={editing === 'new' ? '' : roleDescription(editing)}
              pending={create.isPending || update.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={draft => (editing === 'new' ? create.mutate(draft) : update.mutate(draft))}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={grantsFor !== null} onOpenChange={open => !open && setGrantsFor(null)}>
        <DialogContent className="sm:max-w-lg">
          {grantsFor && (
            <GrantsForm
              role={grantsFor}
              title={t('managePermissionsTitle', { roleName: roleName(grantsFor) })}
              vocabulary={[...new Set([...KNOWN_GRANTS, ...roles.flatMap(role => role.permissions)])].toSorted()}
              pending={saveGrants.isPending}
              onCancel={() => setGrantsFor(null)}
              onSubmit={permissions => saveGrants.mutate({ slug: grantsFor.slug, permissions })}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={roleToDelete !== null} onOpenChange={open => !open && setRoleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20">
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {t('deleteRoleTitle', { roleName: roleToDelete ? roleName(roleToDelete) : '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('deleteRoleDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (roleToDelete) remove.mutate(roleToDelete.slug)
                setRoleToDelete(null)
              }}
            >
              {t('deleteRoleConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function RoleForm({
  role,
  initialName,
  initialDescription,
  pending,
  onCancel,
  onSubmit,
}: {
  role: Role | null
  initialName: string
  initialDescription: string
  pending: boolean
  onCancel: () => void
  onSubmit: (draft: RoleDraft) => void
}) {
  const t = useTranslations('Components.Roles')
  const [slug, setSlug] = useState(role?.slug ?? '')
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [priority, setPriority] = useState(role?.priority ?? 10)

  return (
    <form
      onSubmit={event => {
        event.preventDefault()
        onSubmit({ slug, display_name: name.trim(), description: description.trim(), priority })
      }}
    >
      <DialogHeader>
        <DialogTitle>{role ? t('editRoleTitle') : t('createRoleTitle')}</DialogTitle>
        <DialogDescription>{role ? t('editRoleDescription') : t('createRoleDescription')}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="role-name">{t('fieldName')}</Label>
          <Input
            id="role-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            required
          />
        </div>
        {!role && (
          <div className="grid gap-2">
            <Label htmlFor="role-slug">{t('fieldSlug')}</Label>
            <Input
              id="role-slug"
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder={t('slugPlaceholder')}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
            />
            <p className="text-muted-foreground text-xs">{t('slugHelp')}</p>
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="role-priority">{t('fieldPriority')}</Label>
          <Input
            id="role-priority"
            type="number"
            min={0}
            max={99}
            value={priority}
            onChange={e => setPriority(Number(e.target.value || 0))}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="role-description">{t('fieldDescription')}</Label>
          <Input
            id="role-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('descriptionPlaceholder')}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {t('save')}
        </Button>
      </DialogFooter>
    </form>
  )
}

function GrantsForm({
  role,
  title,
  vocabulary,
  pending,
  onCancel,
  onSubmit,
}: {
  role: Role
  title: string
  vocabulary: string[]
  pending: boolean
  onCancel: () => void
  onSubmit: (permissions: string[]) => void
}) {
  const t = useTranslations('Components.Roles')
  const [grants, setGrants] = useState<string[]>(role.permissions)
  const [draft, setDraft] = useState('')
  const [invalid, setInvalid] = useState(false)
  const options = useMemo(() => vocabulary.filter(grant => !grants.includes(grant)), [vocabulary, grants])

  const add = () => {
    const grant = draft.trim()
    if (!GRANT_PATTERN.test(grant)) return setInvalid(true)
    setGrants(prev => (prev.includes(grant) ? prev : [...prev, grant]))
    setDraft('')
    setInvalid(false)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{t('managePermissionsDescription')}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap gap-1 py-2">
        {grants.length === 0 && <p className="text-muted-foreground text-sm">{t('noGrants')}</p>}
        {grants.map(grant => (
          <Badge key={grant} variant="outline" className="gap-1 pr-1 font-mono">
            {grant}
            <button
              type="button"
              className="hover:bg-muted rounded-sm opacity-60 hover:opacity-100"
              aria-label={t('removeGrantAria', { grant })}
              onClick={() => setGrants(prev => prev.filter(item => item !== grant))}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex items-start gap-2">
        <div className="grid flex-1 gap-1">
          {/* Native datalist: suggestions from the vocabulary, free text kept as typed (a combobox would clear it on close). */}
          <Input
            list="grant-vocabulary"
            value={draft}
            placeholder={t('grantPlaceholder')}
            aria-label={t('grantPlaceholder')}
            aria-invalid={invalid || undefined}
            className="font-mono"
            onChange={event => {
              setDraft(event.target.value)
              setInvalid(false)
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                add()
              }
            }}
          />
          <datalist id="grant-vocabulary">
            {options.map(grant => (
              <option key={grant} value={grant} />
            ))}
          </datalist>
          {invalid && <p className="text-destructive text-xs">{t('invalidGrant')}</p>}
        </div>
        <Button type="button" variant="secondary" onClick={add}>
          {t('addGrant')}
        </Button>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="button" disabled={pending} onClick={() => onSubmit(grants)}>
          {t('save')}
        </Button>
      </DialogFooter>
    </>
  )
}
