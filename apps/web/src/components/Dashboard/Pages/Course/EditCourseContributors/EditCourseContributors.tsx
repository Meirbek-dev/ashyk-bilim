'use client'
import { CourseChoiceCard, getCourseWorkflowToneClass } from '@components/Dashboard/Courses/courseWorkflowUi'
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CourseEditorNotice } from '@/features/courses/editor/components/CourseEditorNotice'
import {
  CourseEditorSection,
  CourseEditorStagedSection,
} from '@/features/courses/editor/components/CourseEditorSection'
import { useCoursesMutations } from '@/hooks/mutations/useCoursesMutations'
import { useCourseSectionDraft } from '@/features/courses/editor/hooks/useCourseSectionDraft'
import { useContributorMutations, useContributors } from '@/features/courses/hooks/useContributors'
import type { ContributorRole, ContributorStatus } from '@/features/courses/hooks/useContributors'
import { Check, ChevronDown, Loader2, Search, Trash2, UserPen, Users } from 'lucide-react'
import { getUserAvatarMediaDirectory } from '@services/media/media'
import { useCourse } from '@components/Contexts/CourseContext'
import { InlineError } from '@/components/ui/error-state'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RadioGroup } from '@/components/ui/radio-group'
import UserAvatar from '@components/Objects/UserAvatar'
import { useSaveSection } from '@/hooks/useSaveSection'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { useSearchContent } from '@/features/search/hooks/useSearch'
import { useApiError } from '@/hooks/useApiError'
import { useSession } from '@/hooks/useSession'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Contributor } from '@/lib/api/generated/zod'
import type { Locale } from '@/i18n/config'
import { toast } from 'sonner'

const ASSIGNABLE_ROLES: Exclude<ContributorRole, 'creator'>[] = ['contributor', 'maintainer', 'reporter']

const formatDate = (unix: number, locale: Locale) =>
  new Date(unix * 1000).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })

const statusTone = (status: string) => (status === 'active' ? 'success' : status === 'pending' ? 'warning' : 'info')

function EditCourseContributors() {
  const t = useTranslations('DashPage.EditCourseContributors')
  const locale = useLocale() as Locale
  const course = useCourse()
  const { courseStructure } = course
  const courseUuid = courseStructure?.course_uuid ?? ''
  const { session, can } = useSession()
  const { toastApiError } = useApiError()
  const { updateAccess } = useCoursesMutations(courseUuid)
  // UX-165: a new application shows up without a reload — focus (the query
  // default) plus every 30 s while visible, like the work queue.
  const roster = useContributors(courseUuid, { refetchInterval: 30_000 })
  const contributors = roster.data ?? []
  const { add, update, remove, isAdding, busyUserId } = useContributorMutations(courseUuid)

  // Roster management mirrors the server rule: creator, active maintainer
  // or a platform course manager; everyone else gets a read-only roster.
  const me = contributors.find(row => row.user_id === session?.userId)
  const canManageRoster =
    can('course', 'manage', 'platform') ||
    me?.role === 'creator' ||
    (me?.role === 'maintainer' && me.status === 'active')

  const initialOpenToContributors =
    typeof courseStructure?.open_to_contributors === 'boolean' ? courseStructure.open_to_contributors : undefined
  const {
    draft: isOpenToContributors,
    setDraft: setIsOpenToContributors,
    isDirty,
    discard,
    markClean,
  } = useCourseSectionDraft({ section: 'contributors', serverValue: initialOpenToContributors })
  const { isSaving, save } = useSaveSection({ section: 'contributors' })

  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Contributor | null>(null)
  const debouncedSearch = useDebouncedValue(searchQuery, 300)
  const hasSearchQuery = debouncedSearch.trim().length > 0
  const search = useSearchContent(debouncedSearch, { limit: 8, enabled: hasSearchQuery })
  const searchResults = hasSearchQuery ? (search.data?.data.users ?? []) : []
  const rosterIds = new Set(contributors.map(row => row.user_id))

  const handleAdd = async (userId: string) => {
    try {
      const added = await add({ user_id: userId, role: 'contributor' })
      toast.success(t('addedContributor', { username: added.username }))
      setSearchQuery('')
      setSearchOpen(false)
    } catch (error) {
      if (hasErrorCode(error, 'conflict')) toast.error(t('alreadyContributorMessage'))
      else toastApiError(error, undefined, t('failedToAddContributorsGeneral'))
    }
  }

  const handleUpdate = async (row: Contributor, body: { role?: ContributorRole; status?: ContributorStatus }) => {
    try {
      await update(row.user_id, body)
      toast.success(t('successfullyUpdatedContributor'))
    } catch (error) {
      // UX-092: the row was withdrawn/removed elsewhere; `onSettled` already refetched.
      if (hasErrorCode(error, 'not-found')) toast.info(t('rowAlreadyGone'))
      else toastApiError(error, undefined, t('failedToUpdateContributor'))
    }
  }

  const handleRemove = async () => {
    const target = removeTarget
    setRemoveTarget(null)
    if (!target) return
    try {
      await remove(target.user_id)
      toast.success(t('removedContributor', { username: target.username }))
    } catch (error) {
      if (hasErrorCode(error, 'not-found')) toast.info(t('rowAlreadyGone'))
      else toastApiError(error, undefined, t('failedToRemoveContributorsGeneral'))
    }
  }

  const handleContributorAccessSave = async () => {
    if (isOpenToContributors === undefined || !isDirty) return
    await save(
      async () =>
        updateAccess(
          { open_to_contributors: isOpenToContributors },
          { lastKnownUpdateDate: courseStructure.update_date },
        ),
      { onSuccess: () => markClean(isOpenToContributors) },
    )
  }

  if (!courseStructure) return null

  return (
    <div className="flex flex-col gap-6">
      <CourseEditorStagedSection
        title={t('courseContributorsTitle')}
        description={t('courseContributorsSubtitle')}
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleContributorAccessSave}
        onDiscard={discard}
      >
        <CourseEditorNotice
          icon={UserPen}
          title={t('contributorPolicyStagedTitle')}
          description={t('contributorPolicyStagedDescription')}
        />

        <RadioGroup
          value={isOpenToContributors === true ? 'open' : isOpenToContributors === false ? 'closed' : undefined}
          onValueChange={val => setIsOpenToContributors(val === 'open')}
          disabled={isSaving}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <CourseChoiceCard
            id="contrib-open"
            value="open"
            checked={isOpenToContributors === true}
            title={t('openToContributorsTitle')}
            description={t('openToContributorsDescription')}
            icon={UserPen}
            disabled={isSaving}
            onSelect={value => setIsOpenToContributors(value === 'open')}
          />

          <CourseChoiceCard
            id="contrib-closed"
            value="closed"
            checked={isOpenToContributors === false}
            title={t('closeToContributorsTitle')}
            description={t('closeToContributorsDescription')}
            icon={Users}
            disabled={isSaving}
            onSelect={value => setIsOpenToContributors(value === 'open')}
          />
        </RadioGroup>
      </CourseEditorStagedSection>

      <CourseEditorSection title={t('manageContributorsTitle')} contentClassName="gap-4">
        <CourseEditorNotice
          icon={Users}
          title={canManageRoster ? t('rosterActionsImmediateTitle') : t('rosterReadOnlyTitle')}
          description={canManageRoster ? t('rosterActionsImmediateDescription') : t('rosterReadOnlyDescription')}
        />

        {roster.isError ? <InlineError description={t('failedToLoadContributors')} error={roster.error} /> : null}

        {canManageRoster ? (
          <Popover
            open={searchOpen}
            onOpenChange={(open, details) => {
              if (!open && details?.reason === 'trigger-press') return
              setSearchOpen(open)
            }}
          >
            <div className="relative w-full">
              <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
              <PopoverTrigger
                render={
                  <Input
                    className="pl-8"
                    placeholder={t('searchUsersPlaceholder')}
                    aria-label={t('searchUsersPlaceholder')}
                    value={searchQuery}
                    onFocus={() => setSearchOpen(searchQuery.trim().length > 0)}
                    onChange={e => {
                      setSearchQuery(e.target.value)
                      setSearchOpen(e.target.value.trim().length > 0)
                    }}
                    onKeyDown={e => e.stopPropagation()}
                    onKeyUp={e => e.stopPropagation()}
                  />
                }
                nativeButton={false}
              />
            </div>
            <PopoverContent className="w-(--anchor-width) p-0" align="start" initialFocus={false}>
              <Command shouldFilter={false}>
                <CommandList>
                  {search.isFetching ? (
                    <div className="text-muted-foreground p-4 text-center text-sm">{t('searchingMessage')}</div>
                  ) : search.isError ? (
                    <InlineError
                      className="m-2"
                      title={t('errorSearchingUsers')}
                      description={t('noUsersFoundMessage')}
                      error={search.error}
                    />
                  ) : (
                    <>
                      <CommandEmpty>{t('noUsersFoundMessage')}</CommandEmpty>
                      <CommandGroup>
                        {searchResults.map(user => {
                          const isExisting = rosterIds.has(user.id)
                          return (
                            <CommandItem
                              key={user.id}
                              value={user.username}
                              disabled={isExisting || isAdding}
                              onSelect={() => !isExisting && void handleAdd(user.id)}
                              className="flex items-center gap-3 py-3"
                            >
                              <UserAvatar
                                size="sm"
                                avatar_url={
                                  user.avatar_key ? getUserAvatarMediaDirectory(user.id, user.avatar_key) : ''
                                }
                                {...(user.avatar_key ? {} : { predefined_avatar: 'empty' })}
                                userId={user.id}
                                username={user.username}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-foreground truncate font-medium">
                                  {user.display_name || user.username}
                                </div>
                                <div className="text-muted-foreground text-xs">@{user.username}</div>
                              </div>
                              {isExisting ? (
                                <span className="bg-muted text-muted-foreground shrink-0 rounded border px-2 py-0.5 text-xs">
                                  {t('alreadyContributorMessage')}
                                </span>
                              ) : (
                                <span className="text-muted-foreground shrink-0 text-xs">{t('addButton')}</span>
                              )}
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        ) : null}

        <div className="bg-card rounded-xl border">
          <AlertDialog open={removeTarget !== null} onOpenChange={open => !open && setRemoveTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-muted text-foreground">
                  <Users className="size-8" />
                </AlertDialogMedia>
                <AlertDialogTitle>
                  {t('removeConfirmTitle', { username: removeTarget?.username ?? '' })}
                </AlertDialogTitle>
                <AlertDialogDescription>{t('removeConfirmMessage')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel />
                <AlertDialogAction variant="destructive" onClick={() => void handleRemove()}>
                  {t('removeButton')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {roster.isPending ? (
            <div className="text-muted-foreground px-4 py-6 text-center text-sm">{t('loadingContributors')}</div>
          ) : (
            <ScrollArea className="max-h-[520px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]" />
                    <TableHead>{t('nameColumn')}</TableHead>
                    <TableHead>{t('roleColumn')}</TableHead>
                    <TableHead>{t('statusColumn')}</TableHead>
                    <TableHead>{t('addedOnColumn')}</TableHead>
                    {canManageRoster ? (
                      <TableHead className="w-[220px] text-right">{t('actionsColumn')}</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contributors.map(row => {
                    const isCreator = row.role === 'creator'
                    const busy = busyUserId === row.user_id
                    return (
                      <TableRow key={row.user_id} data-testid={`contributor-${row.username}`}>
                        <TableCell>
                          <UserAvatar
                            size="sm"
                            variant="outline"
                            avatar_url={row.avatar_key ? getUserAvatarMediaDirectory(row.user_id, row.avatar_key) : ''}
                            {...(row.avatar_key ? {} : { predefined_avatar: 'empty' })}
                            userId={row.user_id}
                            username={row.username}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{row.display_name || row.username}</div>
                          <div className="text-muted-foreground text-xs">@{row.username}</div>
                        </TableCell>
                        <TableCell>
                          {canManageRoster && !isCreator ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button variant="outline" size="sm" className="justify-between" disabled={busy} />
                                }
                              >
                                {t(row.role)}
                                <ChevronDown className="text-muted-foreground ml-2 h-4 w-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                {ASSIGNABLE_ROLES.map(role => (
                                  <DropdownMenuItem
                                    key={role}
                                    onClick={() => role !== row.role && void handleUpdate(row, { role })}
                                    className="justify-between"
                                  >
                                    {t(role)}
                                    {row.role === role && <Check className="ml-2 h-4 w-4" />}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <Badge variant="outline">{t(row.role)}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getCourseWorkflowToneClass(statusTone(row.status))}>
                            {t(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(row.created_at_unix, locale)}
                        </TableCell>
                        {canManageRoster ? (
                          <TableCell className="text-right">
                            {isCreator ? null : busy ? (
                              <Loader2
                                className="text-muted-foreground ml-auto size-4 animate-spin"
                                aria-label={t('updating')}
                              />
                            ) : (
                              <div className="flex justify-end gap-2">
                                {row.status === 'pending' ? (
                                  <Button size="sm" onClick={() => void handleUpdate(row, { status: 'active' })}>
                                    {t('approveButton')}
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      void handleUpdate(row, {
                                        status: row.status === 'active' ? 'inactive' : 'active',
                                      })
                                    }
                                  >
                                    {row.status === 'active' ? t('deactivateButton') : t('activateButton')}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label={t('removeButton')}
                                  onClick={() => setRemoveTarget(row)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>
      </CourseEditorSection>
    </div>
  )
}

export default EditCourseContributors
