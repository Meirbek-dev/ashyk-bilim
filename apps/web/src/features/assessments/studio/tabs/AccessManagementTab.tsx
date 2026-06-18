'use client'

import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  LoaderCircle,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRoundCheck,
  UsersRound,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { responseError } from '@/features/assessments/studio/utils'
import { apiFetch, apiFetcher } from '@/lib/api-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  buildEligibleGroupsPath,
  buildEligibleLearnersPath,
  estimateAudiencePreviewCount,
  getExcludedLoadedCount,
} from './accessBuilderUtils'
import type { AccessMode } from './accessBuilderUtils'

interface AccessUser {
  id: number
  user_uuid: string
  username: string
  first_name?: string | null
  last_name?: string | null
  email: string
}

interface AccessUserGroup {
  id: number
  usergroup_uuid: string
  name: string
  description: string
  member_count: number
}

interface AccessRead {
  mode: AccessMode
  users: AccessUser[]
  usergroups: AccessUserGroup[]
  effective_user_count: number
}

interface StudentPolicyOverride {
  id: number
  user_id: number
  policy_id: number
  max_attempts_override: number | null
  due_at_override: string | null
  time_limit_override_seconds: number | null
  waive_late_penalty: boolean
  note: string
  expires_at: string | null
  granted_by: number | null
}

interface AccessManagementTabProps {
  assessmentUuid: string
  disabled: boolean
}

export default function AccessManagementTab({ assessmentUuid, disabled }: AccessManagementTabProps) {
  const t = useTranslations('Features.Assessments.Studio.AccessManagement')
  const [access, setAccess] = useState<AccessRead | null>(null)
  const [eligibleUsers, setEligibleUsers] = useState<AccessUser[]>([])
  const [eligibleGroups, setEligibleGroups] = useState<AccessUserGroup[]>([])
  const [overrides, setOverrides] = useState<StudentPolicyOverride[]>([])
  const [mode, setMode] = useState<AccessMode>('ALL_COURSE_LEARNERS')
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set())
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const [groupQuery, setGroupQuery] = useState('')
  const [overrideAttempts, setOverrideAttempts] = useState('')
  const [overrideDueAt, setOverrideDueAt] = useState('')
  const [overrideWaiveLate, setOverrideWaiveLate] = useState(false)
  const [overrideNote, setOverrideNote] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSearchingUsers, setIsSearchingUsers] = useState(false)
  const [isSearchingGroups, setIsSearchingGroups] = useState(false)
  const [lastSaveError, setLastSaveError] = useState<string | null>(null)
  const [lastOverrideError, setLastOverrideError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isOverridePending, startOverrideTransition] = useTransition()

  const loadAccess = useCallback(async () => {
    const [accessData, usersData, groupsData, overrideData] = await Promise.all([
      apiFetcher<AccessRead>(`assessments/${assessmentUuid}/access`),
      fetchEligibleUsers(assessmentUuid, ''),
      fetchEligibleGroups(assessmentUuid, ''),
      apiFetcher<StudentPolicyOverride[]>(`assessments/${assessmentUuid}/overrides`),
    ])
    setAccess(accessData)
    setEligibleUsers(usersData)
    setEligibleGroups(groupsData)
    setOverrides(overrideData)
    setMode(accessData.mode)
    setSelectedUsers(new Set(accessData.users.map(user => user.id)))
    setSelectedGroups(new Set(accessData.usergroups.map(group => group.id)))
  }, [assessmentUuid])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      try {
        await loadAccess()
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load assessment access builder', error)
          toast.error(t('loadFailed'))
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [loadAccess, t])

  useEffect(() => {
    let cancelled = false
    const timeout = globalThis.setTimeout(() => {
      void (async () => {
        setIsSearchingUsers(true)
        try {
          const users = await fetchEligibleUsers(assessmentUuid, query)
          if (!cancelled) setEligibleUsers(users)
        } catch (error: unknown) {
          if (!cancelled) {
            console.error('Failed to search eligible assessment learners', error)
            toast.error(t('searchFailed'))
          }
        } finally {
          if (!cancelled) setIsSearchingUsers(false)
        }
      })()
    }, 250)
    return () => {
      cancelled = true
      globalThis.clearTimeout(timeout)
    }
  }, [assessmentUuid, query, t])

  useEffect(() => {
    let cancelled = false
    const timeout = globalThis.setTimeout(() => {
      void (async () => {
        setIsSearchingGroups(true)
        try {
          const groups = await fetchEligibleGroups(assessmentUuid, groupQuery)
          if (!cancelled) setEligibleGroups(groups)
        } catch (error: unknown) {
          if (!cancelled) {
            console.error('Failed to search eligible assessment groups', error)
            toast.error(t('searchFailed'))
          }
        } finally {
          if (!cancelled) setIsSearchingGroups(false)
        }
      })()
    }, 250)
    return () => {
      cancelled = true
      globalThis.clearTimeout(timeout)
    }
  }, [assessmentUuid, groupQuery, t])

  const usersById = useMemo(() => {
    const entries = [...(access?.users ?? []), ...eligibleUsers].map(user => [user.id, user] as const)
    return new Map(entries)
  }, [access?.users, eligibleUsers])

  const groupsById = useMemo(() => {
    const entries = [...(access?.usergroups ?? []), ...eligibleGroups].map(group => [group.id, group] as const)
    return new Map(entries)
  }, [access?.usergroups, eligibleGroups])

  const selectedUserRows = useMemo(
    () => [...selectedUsers].map(id => usersById.get(id)).filter((user): user is AccessUser => Boolean(user)),
    [selectedUsers, usersById],
  )
  const selectedGroupRows = useMemo(
    () => [...selectedGroups].map(id => groupsById.get(id)).filter((group): group is AccessUserGroup => Boolean(group)),
    [groupsById, selectedGroups],
  )
  const overrideByUserId = useMemo(() => new Map(overrides.map(override => [override.user_id, override])), [overrides])
  const effectivePreviewCount = estimateAudiencePreviewCount({
    mode,
    persistedEffectiveCount: access?.effective_user_count ?? null,
    loadedEligibleUserCount: eligibleUsers.length,
    selectedUserCount: selectedUsers.size,
    selectedGroupMemberCounts: selectedGroupRows.map(group => group.member_count),
  })
  const excludedLoadedCount = getExcludedLoadedCount(
    eligibleUsers.map(user => user.id),
    selectedUsers,
  )

  const save = useCallback(() => {
    startTransition(async () => {
      try {
        setLastSaveError(null)
        const response = await apiFetch(`assessments/${assessmentUuid}/access`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            user_ids: mode === 'RESTRICTED' ? [...selectedUsers] : [],
            usergroup_ids: mode === 'RESTRICTED' ? [...selectedGroups] : [],
          }),
        })
        if (!response.ok) throw new Error(await responseError(response, t('saveFailed')))
        const next = (await response.json()) as AccessRead
        setAccess(next)
        setMode(next.mode)
        setSelectedUsers(new Set(next.users.map(user => user.id)))
        setSelectedGroups(new Set(next.usergroups.map(group => group.id)))
        toast.success(t('saved'))
      } catch (error) {
        const message = error instanceof Error ? error.message : t('saveFailed')
        console.error('Failed to save assessment access', error)
        setLastSaveError(message)
        toast.error(message)
      }
    })
  }, [assessmentUuid, mode, selectedGroups, selectedUsers, t])

  const applyOverrides = useCallback(() => {
    startOverrideTransition(async () => {
      try {
        setLastOverrideError(null)
        const targetUserIds = [...selectedUsers]
        if (targetUserIds.length === 0) {
          toast.error(t('overrideNoUsers'))
          return
        }
        const payload = {
          max_attempts_override: overrideAttempts ? Number(overrideAttempts) : null,
          due_at_override: overrideDueAt ? new Date(overrideDueAt).toISOString() : null,
          waive_late_penalty: overrideWaiveLate,
          note: overrideNote,
        }
        const nextOverrides = await Promise.all(
          targetUserIds.map(async userId => {
            const existing = overrideByUserId.get(userId)
            const response = await apiFetch(
              existing
                ? `assessments/${assessmentUuid}/overrides/${userId}`
                : `assessments/${assessmentUuid}/overrides`,
              {
                method: existing ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(existing ? payload : { user_id: userId, ...payload }),
              },
            )
            if (!response.ok) throw new Error(await responseError(response, t('overrideSaveFailed')))
            return (await response.json()) as StudentPolicyOverride
          }),
        )
        setOverrides(current => {
          const byUser = new Map(current.map(override => [override.user_id, override]))
          for (const override of nextOverrides) byUser.set(override.user_id, override)
          return [...byUser.values()]
        })
        toast.success(t('overrideSaved', { count: nextOverrides.length }))
      } catch (error) {
        const message = error instanceof Error ? error.message : t('overrideSaveFailed')
        console.error('Failed to save assessment accommodations', error)
        setLastOverrideError(message)
        toast.error(message)
      }
    })
  }, [
    assessmentUuid,
    overrideAttempts,
    overrideByUserId,
    overrideDueAt,
    overrideNote,
    overrideWaiveLate,
    selectedUsers,
    t,
  ])

  const deleteOverride = useCallback(
    (userId: number) => {
      startOverrideTransition(async () => {
        try {
          const response = await apiFetch(`assessments/${assessmentUuid}/overrides/${userId}`, { method: 'DELETE' })
          if (!response.ok) throw new Error(await responseError(response, t('overrideDeleteFailed')))
          setOverrides(current => current.filter(override => override.user_id !== userId))
          toast.success(t('overrideDeleted'))
        } catch (error) {
          const message = error instanceof Error ? error.message : t('overrideDeleteFailed')
          console.error('Failed to delete assessment accommodation', error)
          setLastOverrideError(message)
          toast.error(message)
        }
      })
    },
    [assessmentUuid, t],
  )

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex min-h-[360px] items-center justify-center text-sm">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        {t('loading')}
      </div>
    )
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 xl:grid-cols-[22rem_minmax(0,1fr)_22rem]">
      <aside className="space-y-4">
        <section className="bg-card rounded-lg border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{t('title')}</h2>
              <p className="text-muted-foreground mt-1 text-xs">{t('description')}</p>
            </div>
            <ShieldCheck className="text-primary size-5 shrink-0" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric label={t('eligibleLoaded')} value={eligibleUsers.length} />
            <Metric label={t('effectivePreview')} value={effectivePreviewCount} />
          </div>
        </section>

        <section className="bg-card rounded-lg border p-4">
          <RadioGroup
            value={mode}
            onValueChange={value => setMode(value as AccessMode)}
            className="space-y-3"
            disabled={disabled}
          >
            <ModeOption
              id="access-all"
              value="ALL_COURSE_LEARNERS"
              title={t('allCourseLearners')}
              description={t('allCourseLearnersDesc')}
              active={mode === 'ALL_COURSE_LEARNERS'}
            />
            <ModeOption
              id="access-restricted"
              value="RESTRICTED"
              title={t('restricted')}
              description={t('restrictedDesc')}
              active={mode === 'RESTRICTED'}
            />
          </RadioGroup>
          <Button className="mt-4 w-full" disabled={disabled || isPending} onClick={save}>
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <UserRoundCheck className="size-4" />}
            {t('save')}
          </Button>
          {lastSaveError ? (
            <RecoverableError message={lastSaveError} retryLabel={t('retrySave')} onRetry={save} />
          ) : null}
        </section>

        <AudiencePreview
          mode={mode}
          selectedUsers={selectedUsers.size}
          selectedGroups={selectedGroups.size}
          effectiveCount={effectivePreviewCount}
          excludedLoadedCount={excludedLoadedCount}
        />
      </aside>

      <main className={cn('grid gap-5 lg:grid-cols-2', mode !== 'RESTRICTED' && 'opacity-60')}>
        <AccessList
          title={t('students')}
          count={selectedUsers.size}
          search={query}
          searchPlaceholder={t('searchStudents')}
          isSearching={isSearchingUsers}
          onSearch={setQuery}
        >
          {eligibleUsers.map(user => (
            <SelectableUserRow
              key={user.id}
              user={user}
              selected={selectedUsers.has(user.id)}
              disabled={disabled || mode !== 'RESTRICTED'}
              hasOverride={overrideByUserId.has(user.id)}
              onToggle={() => toggleSet(setSelectedUsers, user.id)}
            />
          ))}
        </AccessList>

        <AccessList
          title={t('usergroups')}
          count={selectedGroups.size}
          search={groupQuery}
          searchPlaceholder={t('searchGroups')}
          isSearching={isSearchingGroups}
          onSearch={setGroupQuery}
        >
          {eligibleGroups.map(group => (
            <SelectableGroupRow
              key={group.id}
              group={group}
              selected={selectedGroups.has(group.id)}
              expanded={expandedGroups.has(group.id)}
              disabled={disabled || mode !== 'RESTRICTED'}
              onToggle={() => toggleSet(setSelectedGroups, group.id)}
              onExpand={() => toggleSet(setExpandedGroups, group.id)}
            />
          ))}
        </AccessList>
      </main>

      <aside className="space-y-4">
        <SelectedAudienceDrawer
          users={selectedUserRows}
          groups={selectedGroupRows}
          overrides={overrideByUserId}
          disabled={disabled}
          onRemoveUser={id => toggleSet(setSelectedUsers, id)}
          onRemoveGroup={id => toggleSet(setSelectedGroups, id)}
          onDeleteOverride={deleteOverride}
        />
        <AccommodationPanel
          attempts={overrideAttempts}
          dueAt={overrideDueAt}
          note={overrideNote}
          waiveLate={overrideWaiveLate}
          disabled={disabled || isOverridePending}
          isPending={isOverridePending}
          selectedCount={selectedUsers.size}
          lastError={lastOverrideError}
          onAttemptsChange={setOverrideAttempts}
          onDueAtChange={setOverrideDueAt}
          onNoteChange={setOverrideNote}
          onWaiveLateChange={setOverrideWaiveLate}
          onApply={applyOverrides}
        />
      </aside>
    </div>
  )
}

function fetchEligibleUsers(assessmentUuid: string, query: string) {
  return apiFetcher<AccessUser[]>(buildEligibleLearnersPath(assessmentUuid, query))
}

function fetchEligibleGroups(assessmentUuid: string, query: string) {
  return apiFetcher<AccessUserGroup[]>(buildEligibleGroupsPath(assessmentUuid, query))
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  )
}

function ModeOption({
  id,
  value,
  title,
  description,
  active,
}: {
  id: string
  value: AccessMode
  title: string
  description: string
  active: boolean
}) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition',
        active && 'border-primary bg-primary/5',
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="text-muted-foreground block text-xs">{description}</span>
      </span>
    </Label>
  )
}

function AudiencePreview({
  mode,
  selectedUsers,
  selectedGroups,
  effectiveCount,
  excludedLoadedCount,
}: {
  mode: AccessMode
  selectedUsers: number
  selectedGroups: number
  effectiveCount: number
  excludedLoadedCount: number
}) {
  const t = useTranslations('Features.Assessments.Studio.AccessManagement')
  return (
    <section className="bg-card rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2">
        <SlidersHorizontal className="text-muted-foreground size-4" />
        <h3 className="text-sm font-semibold">{t('previewTitle')}</h3>
      </div>
      <div className="space-y-2 text-sm">
        <PreviewRow label={t('previewMode')} value={mode === 'RESTRICTED' ? t('restricted') : t('allCourseLearners')} />
        <PreviewRow label={t('previewSelectedUsers')} value={String(selectedUsers)} />
        <PreviewRow label={t('previewSelectedGroups')} value={String(selectedGroups)} />
        <PreviewRow label={t('previewEffective')} value={String(effectiveCount)} />
        {mode === 'RESTRICTED' ? (
          <PreviewRow label={t('previewExcludedLoaded')} value={String(excludedLoadedCount)} />
        ) : null}
      </div>
      <p className="text-muted-foreground mt-3 text-xs">{t('previewNote')}</p>
    </section>
  )
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function AccessList({
  title,
  count,
  search,
  searchPlaceholder,
  isSearching,
  onSearch,
  children,
}: {
  title: string
  count: number
  search: string
  searchPlaceholder: string
  isSearching: boolean
  onSearch: (value: string) => void
  children: ReactNode
}) {
  return (
    <section className="bg-card flex min-h-[560px] flex-col rounded-lg border">
      <div className="border-b p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <Badge variant="outline">{count}</Badge>
        </div>
        <div className="relative mt-3">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={event => onSearch(event.target.value)}
            placeholder={searchPlaceholder}
            className="pr-9 pl-9"
          />
          {isSearching ? (
            <LoaderCircle className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{children}</div>
    </section>
  )
}

function SelectableUserRow({
  user,
  selected,
  disabled,
  hasOverride,
  onToggle,
}: {
  user: AccessUser
  selected: boolean
  disabled: boolean
  hasOverride: boolean
  onToggle: () => void
}) {
  const t = useTranslations('Features.Assessments.Studio.AccessManagement')
  return (
    <Button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      variant="ghost"
      className="hover:bg-muted/60 bg-background flex h-auto w-full items-center gap-3 rounded-md border p-3 text-left transition disabled:cursor-not-allowed"
    >
      <Checkbox checked={selected} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{displayUser(user)}</p>
        <p className="text-muted-foreground truncate text-xs">{user.email}</p>
      </div>
      {hasOverride ? <Badge variant="secondary">{t('overrideBadge')}</Badge> : null}
    </Button>
  )
}

function SelectableGroupRow({
  group,
  selected,
  expanded,
  disabled,
  onToggle,
  onExpand,
}: {
  group: AccessUserGroup
  selected: boolean
  expanded: boolean
  disabled: boolean
  onToggle: () => void
  onExpand: () => void
}) {
  const t = useTranslations('Features.Assessments.Studio.AccessManagement')
  return (
    <div className="bg-background rounded-md border">
      <div className="flex items-center gap-3 p-3">
        <Button
          type="button"
          disabled={disabled}
          onClick={onToggle}
          variant="ghost"
          className="h-auto min-w-0 flex-1 justify-start gap-3 p-0 text-left hover:bg-transparent disabled:cursor-not-allowed"
        >
          <Checkbox checked={selected} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{group.name}</p>
            <p className="text-muted-foreground truncate text-xs">{group.description || t('noGroupDescription')}</p>
          </div>
        </Button>
        <Badge variant="secondary">
          <UsersRound className="size-3" />
          {group.member_count}
        </Badge>
        <Button type="button" variant="ghost" size="icon" aria-label={t('expandGroup')} onClick={onExpand}>
          <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
        </Button>
      </div>
      {expanded ? (
        <div className="text-muted-foreground border-t px-3 py-2 text-xs">
          {t('groupExpansion', { count: group.member_count })}
        </div>
      ) : null}
    </div>
  )
}

function SelectedAudienceDrawer({
  users,
  groups,
  overrides,
  disabled,
  onRemoveUser,
  onRemoveGroup,
  onDeleteOverride,
}: {
  users: AccessUser[]
  groups: AccessUserGroup[]
  overrides: Map<number, StudentPolicyOverride>
  disabled: boolean
  onRemoveUser: (id: number) => void
  onRemoveGroup: (id: number) => void
  onDeleteOverride: (userId: number) => void
}) {
  const t = useTranslations('Features.Assessments.Studio.AccessManagement')
  return (
    <section className="bg-card rounded-lg border">
      <div className="border-b p-4">
        <h3 className="text-sm font-semibold">{t('selectedDrawerTitle')}</h3>
        <p className="text-muted-foreground mt-1 text-xs">{t('selectedDrawerDesc')}</p>
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto p-3">
        {users.length === 0 && groups.length === 0 ? (
          <p className="text-muted-foreground p-2 text-sm">{t('selectedEmpty')}</p>
        ) : null}
        {users.map(user => {
          const override = overrides.get(user.id)
          return (
            <div key={user.id} className="rounded-md border p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{displayUser(user)}</p>
                  <p className="text-muted-foreground truncate text-xs">{user.email}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  aria-label={t('removeSelected')}
                  onClick={() => onRemoveUser(user.id)}
                >
                  <X className="size-4" />
                </Button>
              </div>
              {override ? (
                <div className="bg-muted/50 mt-2 flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs">
                  <span>{describeOverride(override, t)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onDeleteOverride(user.id)}
                  >
                    {t('clearOverride')}
                  </Button>
                </div>
              ) : null}
            </div>
          )
        })}
        {groups.map(group => (
          <div key={group.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{group.name}</p>
              <p className="text-muted-foreground text-xs">{t('groupMembers', { count: group.member_count })}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={t('removeSelected')}
              onClick={() => onRemoveGroup(group.id)}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  )
}

function AccommodationPanel({
  attempts,
  dueAt,
  note,
  waiveLate,
  disabled,
  isPending,
  selectedCount,
  lastError,
  onAttemptsChange,
  onDueAtChange,
  onNoteChange,
  onWaiveLateChange,
  onApply,
}: {
  attempts: string
  dueAt: string
  note: string
  waiveLate: boolean
  disabled: boolean
  isPending: boolean
  selectedCount: number
  lastError: string | null
  onAttemptsChange: (value: string) => void
  onDueAtChange: (value: string) => void
  onNoteChange: (value: string) => void
  onWaiveLateChange: (value: boolean) => void
  onApply: () => void
}) {
  const t = useTranslations('Features.Assessments.Studio.AccessManagement')
  return (
    <section className="bg-card rounded-lg border p-4">
      <div className="mb-4 flex items-start gap-3">
        <CalendarClock className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold">{t('accommodationsTitle')}</h3>
          <p className="text-muted-foreground mt-1 text-xs">{t('accommodationsDesc')}</p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="override-attempts">{t('overrideAttempts')}</Label>
          <Input
            id="override-attempts"
            type="number"
            min={1}
            value={attempts}
            disabled={disabled}
            placeholder={t('policyDefault')}
            onChange={event => onAttemptsChange(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="override-due-at">{t('overrideDueAt')}</Label>
          <Input
            id="override-due-at"
            type="datetime-local"
            value={dueAt}
            disabled={disabled}
            onChange={event => onDueAtChange(event.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <Label htmlFor="override-waive-late" className="text-sm">
            {t('waiveLatePenalty')}
          </Label>
          <Switch
            id="override-waive-late"
            checked={waiveLate}
            disabled={disabled}
            onCheckedChange={onWaiveLateChange}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="override-note">{t('overrideNote')}</Label>
          <Input
            id="override-note"
            value={note}
            disabled={disabled}
            placeholder={t('overrideNotePlaceholder')}
            onChange={event => onNoteChange(event.target.value)}
          />
        </div>
        <Button className="w-full" disabled={disabled || selectedCount === 0} onClick={onApply}>
          {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <UserRoundCheck className="size-4" />}
          {t('applyOverrides', { count: selectedCount })}
        </Button>
        {lastError ? <RecoverableError message={lastError} retryLabel={t('retryOverrides')} onRetry={onApply} /> : null}
      </div>
    </section>
  )
}

function RecoverableError({
  message,
  retryLabel,
  onRetry,
}: {
  message: string
  retryLabel: string
  onRetry: () => void
}) {
  return (
    <div
      className="border-destructive/30 bg-destructive/5 mt-3 rounded-md border p-3"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
        <p className="text-destructive text-sm">{message}</p>
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>
        <RotateCcw className="size-3.5" />
        {retryLabel}
      </Button>
    </div>
  )
}

function toggleSet(setter: Dispatch<SetStateAction<Set<number>>>, id: number) {
  setter(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}

function displayUser(user: AccessUser) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
  return name || user.username
}

function describeOverride(override: StudentPolicyOverride, t: ReturnType<typeof useTranslations>) {
  const parts = [
    override.max_attempts_override ? t('overrideAttemptsValue', { count: override.max_attempts_override }) : null,
    override.due_at_override ? t('overrideDueValue') : null,
    override.waive_late_penalty ? t('overrideWaiveLateValue') : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' / ') : t('overrideBadge')
}
