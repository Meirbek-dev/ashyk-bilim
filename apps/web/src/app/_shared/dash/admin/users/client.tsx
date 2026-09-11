'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Plus, Search, X } from 'lucide-react'
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
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Actions, Resources, Scopes } from '@/components/Security'
import { useAdminUsers, useAllMembers, useRoles } from '@/features/users/hooks/useUsers'
import { useRoleLabels } from '@/features/users/hooks/useRoleLabels'
import { useApiError } from '@/hooks/useApiError'
import { useSession } from '@/hooks/useSession'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import type { AdminUser, Role } from '@/lib/api/generated/zod'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { assignRoleToUser, removeRoleFromUser, setUserStatus } from '@/services/rbac'

export default function UserRolesClient() {
  const t = useTranslations('Components.Roles')
  const { user: me, can } = useSession()
  const queryClient = useQueryClient()
  const { toastApiError } = useApiError()
  const canManageRoles = can(Resources.ROLE, Actions.MANAGE, Scopes.APP)
  const canManageStatus = can(Resources.APP, Actions.MANAGE, Scopes.APP)

  const [search, setSearch] = useState('')
  const q = useDeferredValue(search.trim())
  const users = useAdminUsers(q)
  const rows = useMemo(() => users.data?.pages.flatMap(page => page.items) ?? [], [users.data])
  const { data: roles = [] } = useRoles()
  const { roleName } = useRoleLabels(roles)

  const [addOpen, setAddOpen] = useState(false)
  const [roleToRemove, setRoleToRemove] = useState<{ user: AdminUser; slug: string } | null>(null)
  const [userToDisable, setUserToDisable] = useState<AdminUser | null>(null)

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: queryKeys.users.adminAll() })

  const assign = useMutation({
    mutationFn: ({ userId, slug }: { userId: string; slug: string }) => assignRoleToUser(userId, slug),
    onSuccess: async () => {
      toast.success(t('assignedRoleSuccess'))
      setAddOpen(false)
      await invalidateUsers()
    },
    onError: error => toastApiError(error),
  })
  const remove = useMutation({
    mutationFn: ({ userId, slug }: { userId: string; slug: string }) => removeRoleFromUser(userId, slug),
    onSuccess: async () => {
      toast.success(t('removedRoleSuccess'))
      await invalidateUsers()
    },
    // The only 409 this endpoint answers is the last-admin guard; the generic `conflict` copy talks about stale data.
    onError: error => (hasErrorCode(error, 'conflict') ? toast.error(t('lastAdminConflict')) : toastApiError(error)),
  })
  const status = useMutation({
    mutationFn: ({ userId, disabled }: { userId: string; disabled: boolean }) => setUserStatus(userId, { disabled }),
    onSuccess: async () => {
      toast.success(t('statusUpdated'))
      await invalidateUsers()
    },
    onError: error => (hasErrorCode(error, 'conflict') ? toast.error(t('selfDisableConflict')) : toastApiError(error)),
  })

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('userRolesTitle')}</h1>
          <p className="text-muted-foreground">{t('userRolesDescription')}</p>
        </div>
        {canManageRoles && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger
              render={
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('addRole')}
                </Button>
              }
            />
            <DialogContent className="sm:max-w-md">
              {addOpen && (
                <AssignRoleForm
                  roles={roles}
                  roleName={roleName}
                  pending={assign.isPending}
                  onCancel={() => setAddOpen(false)}
                  onSubmit={(userId, slug) => assign.mutate({ userId, slug })}
                />
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="space-y-4 p-4">
        <div className="relative max-w-sm">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
          <Input
            type="search"
            className="pl-8"
            placeholder={t('searchUsers')}
            aria-label={t('searchUsers')}
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>

        {users.isError ? (
          <p className="text-destructive text-sm">{t('loadFailed')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('tableHead.user')}</TableHead>
                <TableHead>{t('tableHead.email')}</TableHead>
                <TableHead>{t('tableHead.status')}</TableHead>
                <TableHead>{t('tableHead.roles')}</TableHead>
                {canManageStatus && <TableHead className="text-right">{t('tableHead.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.isPending ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-center">
                    {t('noUsers')}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(user => {
                  const isSelf = user.id === me?.id
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="font-medium">{user.display_name || user.username}</div>
                        <div className="text-muted-foreground text-xs">@{user.username}</div>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.status === 'active' ? 'secondary' : 'destructive'}>
                          {t(user.status === 'active' ? 'status.active' : 'status.disabled')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map(slug => (
                            <Badge key={slug} variant="outline" className="gap-1 pr-1">
                              {roleName(slug)}
                              {/* Stripping your own admin role locks you out of this page. */}
                              {canManageRoles && !(isSelf && slug === 'admin') && (
                                <button
                                  type="button"
                                  className="hover:bg-muted rounded-sm opacity-60 hover:opacity-100"
                                  aria-label={t('removeRoleAria', { roleName: roleName(slug) })}
                                  onClick={() => setRoleToRemove({ user, slug })}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      {canManageStatus && (
                        <TableCell className="text-right">
                          {!isSelf &&
                            (user.status === 'active' ? (
                              <Button variant="ghost" size="sm" onClick={() => setUserToDisable(user)}>
                                {t('disableUser')}
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={status.isPending}
                                onClick={() => status.mutate({ userId: user.id, disabled: false })}
                              >
                                {t('enableUser')}
                              </Button>
                            ))}
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        )}

        {users.hasNextPage && (
          <Button variant="outline" disabled={users.isFetchingNextPage} onClick={() => users.fetchNextPage()}>
            {t('loadMore')}
          </Button>
        )}
      </Card>

      <AlertDialog open={roleToRemove !== null} onOpenChange={open => !open && setRoleToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20">
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('removeRoleConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('removeRoleConfirmDescription', {
                roleName: roleToRemove ? roleName(roleToRemove.slug) : '',
                name: roleToRemove?.user.display_name || roleToRemove?.user.username || '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (roleToRemove) remove.mutate({ userId: roleToRemove.user.id, slug: roleToRemove.slug })
                setRoleToRemove(null)
              }}
            >
              {t('removeRoleConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={userToDisable !== null} onOpenChange={open => !open && setUserToDisable(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20">
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {t('disableConfirmTitle', { name: userToDisable?.display_name || userToDisable?.username || '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('disableConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (userToDisable) status.mutate({ userId: userToDisable.id, disabled: true })
                setUserToDisable(null)
              }}
            >
              {t('disableUser')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function AssignRoleForm({
  roles,
  roleName,
  pending,
  onCancel,
  onSubmit,
}: {
  roles: Role[]
  roleName: (role: Role) => string
  pending: boolean
  onCancel: () => void
  onSubmit: (userId: string, slug: string) => void
}) {
  const t = useTranslations('Components.Roles')
  // ponytail: the picker walks the whole listing; switch to a `q`-backed combobox past a few thousand users.
  const { data: members = [] } = useAllMembers()
  const [user, setUser] = useState<AdminUser | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const userLabel = (member: AdminUser) => `${member.display_name || member.username} (${member.email})`

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('assignRoleTitle')}</DialogTitle>
        <DialogDescription>{t('assignRoleDescription')}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="grid gap-2">
          <Label htmlFor="assign-user">{t('userLabel')}</Label>
          <Combobox items={members} itemToStringLabel={userLabel} value={user} onValueChange={setUser}>
            <ComboboxInput id="assign-user" placeholder={t('selectUserPlaceholder')} className="w-full" />
            <ComboboxContent>
              <ComboboxEmpty>{t('noMatches')}</ComboboxEmpty>
              <ComboboxList>
                {(member: AdminUser) => (
                  <ComboboxItem key={member.id} value={member}>
                    {userLabel(member)}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="assign-role">{t('roleLabel')}</Label>
          <Combobox items={roles} itemToStringLabel={roleName} value={role} onValueChange={setRole}>
            <ComboboxInput id="assign-role" placeholder={t('selectRolePlaceholder')} className="w-full" />
            <ComboboxContent>
              <ComboboxEmpty>{t('noMatches')}</ComboboxEmpty>
              <ComboboxList>
                {(item: Role) => (
                  <ComboboxItem key={item.slug} value={item}>
                    {roleName(item)}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button disabled={!user || !role || pending} onClick={() => user && role && onSubmit(user.id, role.slug)}>
          {t('assignRole')}
        </Button>
      </DialogFooter>
    </>
  )
}
