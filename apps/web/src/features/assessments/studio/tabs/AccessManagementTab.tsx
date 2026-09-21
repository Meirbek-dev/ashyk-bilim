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
import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  createOverride,
  deleteOverride,
  listOverrides,
  updateOverride,
} from '@/lib/api/generated/assessments/assessments'
import { assessmentAccessQueryOptions, setVersionedAccess } from '@/features/assessments/queries'
import { usergroupsForCourse } from '@/lib/api/generated/usergroups/usergroups'
import type { OverrideRequest, StudentOverride } from '@/lib/api/generated/zod'
import { toUnix } from '@/lib/api/contract'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { collectGradebookPages } from '@/features/grading/queries/grading.query'
import { useApiError } from '@/hooks/useApiError'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  estimateAudiencePreviewCount,
  filterByQuery,
  getExcludedLoadedCount,
  isLockout,
  uniqueById,
} from './accessBuilderUtils'
import type { AccessGroupRow, AccessLearner, AccessMode } from './accessBuilderUtils'

interface AccessManagementTabProps {
  assessmentUuid: string
  courseUuid: string | null
  disabled: boolean
}

export default function AccessManagementTab({ assessmentUuid, courseUuid, disabled }: AccessManagementTabProps) {
  const t = useTranslations('Features.Assessments.Studio.AccessManagement')
  const tDialog = useTranslations('Components.AlertDialog')
  const queryClient = useQueryClient()
  const { handleApiError, toastApiError } = useApiError()
  const [mode, setMode] = useState<AccessMode>('all_course_learners')
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [groupQuery, setGroupQuery] = useState('')
  const [overrideAttempts, setOverrideAttempts] = useState('')
  const [overrideDueAt, setOverrideDueAt] = useState('')
  const [overrideWaiveLate, setOverrideWaiveLate] = useState(false)
  const [overrideNote, setOverrideNote] = useState('')
  const [lastSaveError, setLastSaveError] = useState<string | null>(null)
  const [lastOverrideError, setLastOverrideError] = useState<string | null>(null)
  // UX-057: 422 field errors land on the chip / input they name, not in a toast.
  const [fieldErrors, setFieldErrors] = useState<Map<string, string>>(new Map())
  const [confirmLockout, setConfirmLockout] = useState(false)

  const accessKey = queryKeys.assessments.access(assessmentUuid)
  const overridesKey = queryKeys.assessments.overrides(assessmentUuid)
  const accessQuery = useQuery(assessmentAccessQueryOptions(assessmentUuid))
  const overridesQuery = useQuery({ queryKey: overridesKey, queryFn: () => listOverrides(assessmentUuid) })
  // v2 has no `access/eligible-*` search routes: the pickers are the course's
  // linked groups and the gradebook's learners, filtered client-side.
  // ponytail: the gradebook only lists learners with a submission — v2 has no
  // enrollment listing, so a never-submitted learner is only pickable once
  // persisted (it then comes back in `AccessView.users`).
  const groupsQuery = useQuery({
    queryKey: queryKeys.courses.usergroups(courseUuid ?? ''),
    queryFn: () => usergroupsForCourse(courseUuid ?? ''),
    enabled: Boolean(courseUuid),
  })
  const learnersQuery = useQuery({
    queryKey: queryKeys.courses.learners(courseUuid ?? ''),
    queryFn: async () => uniqueById((await collectGradebookPages(courseUuid ?? '')).flatMap(page => page.users)),
    enabled: Boolean(courseUuid),
  })
  const access = accessQuery.data ?? null
  const overrides = useMemo(() => overridesQuery.data ?? [], [overridesQuery.data])
  const isLoading =
    accessQuery.isPending ||
    overridesQuery.isPending ||
    (Boolean(courseUuid) && (groupsQuery.isPending || learnersQuery.isPending))
  const loadError = accessQuery.error ?? overridesQuery.error ?? groupsQuery.error ?? learnersQuery.error

  useEffect(() => {
    if (!access) return
    setMode(access.mode)
    setSelectedUsers(new Set(access.users.map(user => user.id)))
    setSelectedGroups(new Set(access.usergroups.map(group => group.id)))
  }, [access])

  useEffect(() => {
    if (loadError) toastApiError(loadError, { fallback: t('loadFailed') })
  }, [loadError, t, toastApiError])

  const allUsers = useMemo<AccessLearner[]>(
    () => uniqueById<AccessLearner>(learnersQuery.data ?? [], access?.users ?? []),
    [access?.users, learnersQuery.data],
  )
  const allGroups = useMemo<AccessGroupRow[]>(
    () => uniqueById<AccessGroupRow>(groupsQuery.data ?? [], access?.usergroups ?? []),
    [access?.usergroups, groupsQuery.data],
  )
  const eligibleUsers = useMemo(
    () => filterByQuery(allUsers, query, user => [user.display_name, user.username, user.email]),
    [allUsers, query],
  )
  const eligibleGroups = useMemo(
    () => filterByQuery(allGroups, groupQuery, group => [group.name, group.description]),
    [allGroups, groupQuery],
  )
  const usersById = useMemo(() => new Map(allUsers.map(user => [user.id, user])), [allUsers])
  const groupsById = useMemo(() => new Map(allGroups.map(group => [group.id, group])), [allGroups])

  const selectedUserRows = useMemo(
    () => [...selectedUsers].map(id => usersById.get(id)).filter((user): user is AccessLearner => Boolean(user)),
    [selectedUsers, usersById],
  )
  const selectedGroupRows = useMemo(
    () => [...selectedGroups].map(id => groupsById.get(id)).filter((group): group is AccessGroupRow => Boolean(group)),
    [groupsById, selectedGroups],
  )
  const overrideByUserId = useMemo(() => new Map(overrides.map(override => [override.user_id, override])), [overrides])
  const effectivePreviewCount = estimateAudiencePreviewCount({
    mode,
    persistedEffectiveCount: access?.effective_user_count ?? null,
    loadedEligibleUserCount: allUsers.length,
    selectedUserCount: selectedUsers.size,
    selectedGroupMemberCounts: selectedGroupRows.map(group => group.member_count),
  })
  const excludedLoadedCount = getExcludedLoadedCount(
    allUsers.map(user => user.id),
    selectedUsers,
  )

  const saveMutation = useMutation({
    // UX-154: echo the loaded version; another tab's save makes this a 412.
    mutationFn: () =>
      setVersionedAccess(
        assessmentUuid,
        {
          mode,
          user_ids: mode === 'restricted' ? [...selectedUsers] : [],
          usergroup_ids: mode === 'restricted' ? [...selectedGroups] : [],
        },
        access?.version ?? null,
      ),
    onMutate: () => {
      setLastSaveError(null)
      setFieldErrors(new Map())
    },
    onSuccess: next => {
      queryClient.setQueryData(accessKey, next)
      toast.success(t('saved'))
    },
    onError: error => {
      if (hasErrorCode(error, 'precondition-failed')) {
        // The other tab's policy replaces the stale form; the toast says why.
        void queryClient.invalidateQueries({ queryKey: accessKey })
        setLastSaveError(toastApiError(error, { fallback: t('saveFailed') }).message)
        return
      }
      const byField = collectFieldErrors(error, handleApiError, t('saveFailed'))
      if (byField.size === 0) {
        setLastSaveError(toastApiError(error, { fallback: t('saveFailed') }).message)
        return
      }
      setFieldErrors(byField)
      setLastSaveError(t('fixHighlighted'))
    },
  })
  const save = () => {
    if (isLockout(mode, selectedUsers.size, selectedGroups.size)) {
      setConfirmLockout(true)
      return
    }
    saveMutation.mutate()
  }

  const overrideMutation = useMutation({
    mutationFn: () => {
      const payload: OverrideRequest = {
        max_attempts_override: overrideAttempts ? Number(overrideAttempts) : null,
        due_at_override_unix: toUnix(overrideDueAt || null),
        waive_late_penalty: overrideWaiveLate,
        note: overrideNote,
      }
      return Promise.all(
        [...selectedUsers].map(userId =>
          overrideByUserId.has(userId)
            ? updateOverride(assessmentUuid, userId, payload)
            : createOverride(assessmentUuid, userId, payload),
        ),
      )
    },
    onMutate: () => {
      setLastOverrideError(null)
      setFieldErrors(new Map())
    },
    onSuccess: nextOverrides => {
      queryClient.setQueryData<StudentOverride[]>(overridesKey, (current = []) => {
        const byUser = new Map(current.map(override => [override.user_id, override]))
        for (const override of nextOverrides) byUser.set(override.user_id, override)
        return [...byUser.values()]
      })
      toast.success(t('overrideSaved', { count: nextOverrides.length }))
    },
    onError: error => {
      const byField = collectFieldErrors(error, handleApiError, t('overrideSaveFailed'))
      if (byField.size === 0) {
        setLastOverrideError(toastApiError(error, { fallback: t('overrideSaveFailed') }).message)
        return
      }
      setFieldErrors(byField)
      setLastOverrideError(t('fixHighlighted'))
    },
  })
  const applyOverrides = () => {
    if (selectedUsers.size === 0) {
      toast.error(t('overrideNoUsers'))
      return
    }
    overrideMutation.mutate()
  }

  const deleteOverrideMutation = useMutation({
    mutationFn: (userId: string) => deleteOverride(assessmentUuid, userId),
    onMutate: () => setLastOverrideError(null),
    onSuccess: (_result, userId) => {
      queryClient.setQueryData<StudentOverride[]>(overridesKey, (current = []) =>
        current.filter(override => override.user_id !== userId),
      )
      toast.success(t('overrideDeleted'))
    },
    onError: error => setLastOverrideError(toastApiError(error, { fallback: t('overrideDeleteFailed') }).message),
  })
  const isOverridePending = overrideMutation.isPending || deleteOverrideMutation.isPending

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex min-h-[360px] items-center justify-center text-sm">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        {t('loading')}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[92rem] space-y-5 px-4 py-5 md:px-6">
      <section className="bg-card rounded-lg border p-4 shadow-sm">
        <div className="grid gap-4 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(28rem,1.2fr)_minmax(18rem,0.7fr)] xl:items-start">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-md">
              <ShieldCheck className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">{t('title')}</h2>
              <p className="text-muted-foreground mt-1 text-xs">{t('description')}</p>
            </div>
          </div>

          <RadioGroup
            value={mode}
            onValueChange={value => setMode(value as AccessMode)}
            className="grid gap-3 md:grid-cols-2"
            disabled={disabled}
          >
            <ModeOption
              id="access-all"
              value="all_course_learners"
              title={t('allCourseLearners')}
              description={t('allCourseLearnersDesc')}
              active={mode === 'all_course_learners'}
            />
            <ModeOption
              id="access-restricted"
              value="restricted"
              title={t('restricted')}
              description={t('restrictedDesc')}
              active={mode === 'restricted'}
            />
          </RadioGroup>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Metric label={t('eligibleLoaded')} value={allUsers.length} />
              <Metric label={t('effectivePreview')} value={effectivePreviewCount} />
            </div>
            <Button className="w-full" disabled={disabled || saveMutation.isPending} onClick={save}>
              {saveMutation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <UserRoundCheck className="size-4" />
              )}
              {t('save')}
            </Button>
          </div>
        </div>
        {lastSaveError ? <RecoverableError message={lastSaveError} retryLabel={t('retrySave')} onRetry={save} /> : null}
      </section>

      <AlertDialog open={confirmLockout} onOpenChange={setConfirmLockout}>
        <AlertDialogContent size="sm">
          <AlertDialogTitle>{t('lockoutTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('lockoutDesc')}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{tDialog('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => saveMutation.mutate()}>{t('lockoutConfirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.42fr)]">
        <main className={cn('grid gap-5 lg:grid-cols-2', mode !== 'restricted' && 'opacity-60')}>
          <AccessList
            title={t('students')}
            count={selectedUsers.size}
            search={query}
            searchPlaceholder={t('searchStudents')}
            onSearch={setQuery}
          >
            {eligibleUsers.map(user => (
              <SelectableUserRow
                key={user.id}
                user={user}
                selected={selectedUsers.has(user.id)}
                disabled={disabled || mode !== 'restricted'}
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
            onSearch={setGroupQuery}
          >
            {eligibleGroups.map(group => (
              <SelectableGroupRow
                key={group.id}
                group={group}
                selected={selectedGroups.has(group.id)}
                expanded={expandedGroups.has(group.id)}
                disabled={disabled || mode !== 'restricted'}
                onToggle={() => toggleSet(setSelectedGroups, group.id)}
                onExpand={() => toggleSet(setExpandedGroups, group.id)}
              />
            ))}
          </AccessList>
        </main>

        <aside className="space-y-4">
          <AudiencePreview
            mode={mode}
            selectedUsers={selectedUsers.size}
            selectedGroups={selectedGroups.size}
            effectiveCount={effectivePreviewCount}
            excludedLoadedCount={excludedLoadedCount}
          />
          <SelectedAudienceDrawer
            users={selectedUserRows}
            groups={selectedGroupRows}
            overrides={overrideByUserId}
            errors={fieldErrors}
            disabled={disabled}
            onRemoveUser={id => toggleSet(setSelectedUsers, id)}
            onRemoveGroup={id => toggleSet(setSelectedGroups, id)}
            onDeleteOverride={userId => deleteOverrideMutation.mutate(userId)}
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
            attemptsError={fieldErrors.get('max_attempts_override') ?? null}
            onAttemptsChange={setOverrideAttempts}
            onDueAtChange={setOverrideDueAt}
            onNoteChange={setOverrideNote}
            onWaiveLateChange={setOverrideWaiveLate}
            onApply={applyOverrides}
          />
        </aside>
      </div>
    </div>
  )
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
        <PreviewRow label={t('previewMode')} value={mode === 'restricted' ? t('restricted') : t('allCourseLearners')} />
        <PreviewRow label={t('previewSelectedUsers')} value={String(selectedUsers)} />
        <PreviewRow label={t('previewSelectedGroups')} value={String(selectedGroups)} />
        <PreviewRow label={t('previewEffective')} value={String(effectiveCount)} />
        {mode === 'restricted' ? (
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
  onSearch,
  children,
}: {
  title: string
  count: number
  search: string
  searchPlaceholder: string
  onSearch: (value: string) => void
  children: ReactNode
}) {
  return (
    <section className="bg-card flex min-h-[620px] flex-col rounded-lg border shadow-sm">
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
            className="pl-9"
          />
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
  user: AccessLearner
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
        <p className="text-muted-foreground truncate text-xs">{user.email ?? user.username}</p>
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
  group: AccessGroupRow
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
  errors,
  disabled,
  onRemoveUser,
  onRemoveGroup,
  onDeleteOverride,
}: {
  users: AccessLearner[]
  groups: AccessGroupRow[]
  overrides: Map<string, StudentOverride>
  /** Server field errors keyed `user_ids.<id>` / `usergroup_ids.<id>`. */
  errors: Map<string, string>
  disabled: boolean
  onRemoveUser: (id: string) => void
  onRemoveGroup: (id: string) => void
  onDeleteOverride: (userId: string) => void
}) {
  const t = useTranslations('Features.Assessments.Studio.AccessManagement')
  return (
    <section className="bg-card rounded-lg border shadow-sm">
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
          const error = errors.get(`user_ids.${user.id}`)
          return (
            <div key={user.id} className={cn('rounded-md border p-2', error && 'border-destructive')}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{displayUser(user)}</p>
                  <p className="text-muted-foreground truncate text-xs">{user.email ?? user.username}</p>
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
              {error ? <p className="text-destructive mt-1 text-xs">{error}</p> : null}
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
        {groups.map(group => {
          const error = errors.get(`usergroup_ids.${group.id}`)
          return (
            <div
              key={group.id}
              className={cn(
                'flex items-center justify-between gap-2 rounded-md border p-2',
                error && 'border-destructive',
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{group.name}</p>
                <p className="text-muted-foreground text-xs">{t('groupMembers', { count: group.member_count })}</p>
                {error ? <p className="text-destructive text-xs">{error}</p> : null}
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
          )
        })}
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
  attemptsError,
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
  attemptsError: string | null
  onAttemptsChange: (value: string) => void
  onDueAtChange: (value: string) => void
  onNoteChange: (value: string) => void
  onWaiveLateChange: (value: boolean) => void
  onApply: () => void
}) {
  const t = useTranslations('Features.Assessments.Studio.AccessManagement')
  return (
    <section className="bg-card rounded-lg border p-4 shadow-sm">
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
            max={10}
            value={attempts}
            disabled={disabled}
            aria-invalid={attemptsError ? true : undefined}
            placeholder={t('policyDefault')}
            onChange={event => onAttemptsChange(event.target.value)}
          />
          {attemptsError ? <p className="text-destructive text-xs">{attemptsError}</p> : null}
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

/** Localized 422 field errors keyed by field; empty when the failure is not a validation one. */
function collectFieldErrors(
  error: unknown,
  handleApiError: ReturnType<typeof useApiError>['handleApiError'],
  fallback: string,
): Map<string, string> {
  const byField = new Map<string, string>()
  handleApiError(error, {
    fallback,
    setError: (name, fieldError) => byField.set(name, fieldError.message ?? ''),
  })
  return byField
}

function toggleSet(setter: Dispatch<SetStateAction<Set<string>>>, id: string) {
  setter(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}

function displayUser(user: AccessLearner) {
  return user.display_name.trim() || user.username
}

function describeOverride(override: StudentOverride, t: ReturnType<typeof useTranslations>) {
  const parts = [
    override.max_attempts_override ? t('overrideAttemptsValue', { count: override.max_attempts_override }) : null,
    override.due_at_override_unix ? t('overrideDueValue') : null,
    override.waive_late_penalty ? t('overrideWaiveLateValue') : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' / ') : t('overrideBadge')
}
