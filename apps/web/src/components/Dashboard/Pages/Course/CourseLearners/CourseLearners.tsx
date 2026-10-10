'use client'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CourseEditorNotice } from '@/features/courses/editor/components/CourseEditorNotice'
import { CourseEditorSection } from '@/features/courses/editor/components/CourseEditorSection'
import { getCourseWorkflowToneClass } from '@components/Dashboard/Courses/courseWorkflowUi'
import { enrollCourseLearners, listCourseLearners, removeCourseLearner } from '@/lib/api/generated/progress/progress'
import { usergroupsForCourse } from '@/lib/api/generated/usergroups/usergroups'
import type { CourseLearner, EnrollLearnersResponse, EnrollOutcome } from '@/lib/api/generated/zod'
import { MAX_ROSTER_IDENTIFIERS, decodeCsv, parsePastedIdentifiers, parseRosterCsv } from '@/lib/roster-import'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileUp, GraduationCap, Loader2, Search, Trash2, UserPlus, Users } from 'lucide-react'
import { collectPages, unixToIso } from '@/lib/api/contract'
import { csvBlob, saveBlob } from '@/lib/download'
import { formatDate } from '@/lib/date'
import { getUserAvatarMediaDirectory } from '@services/media/media'
import { stripEntityPrefix } from '@/hooks/courses/courseKeys'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { isCourseArchived } from '@/lib/course-management'
import { useCourse } from '@components/Contexts/CourseContext'
import { InlineError } from '@/components/ui/error-state'
import { ScrollArea } from '@/components/ui/scroll-area'
import UserAvatar from '@components/Objects/UserAvatar'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { useApiError } from '@/hooks/useApiError'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import { useLocale, useTranslations } from 'next-intl'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

const PAGE_SIZE = 50
const MAX_CSV_BYTES = 1024 * 1024
const OUTCOMES: EnrollOutcome[] = [
  'enrolled',
  'already_enrolled',
  'duplicate',
  'not_found',
  'course_staff',
  'account_disabled',
]
const outcomeTone = (outcome: EnrollOutcome) =>
  outcome === 'enrolled'
    ? 'success'
    : outcome === 'already_enrolled' || outcome === 'duplicate'
      ? 'info'
      : outcome === 'not_found'
        ? 'warning'
        : 'danger'

/** The course's learner roster: list, search, enrol (paste or CSV), remove, export (QA cluster H). */
export default function CourseLearners() {
  const t = useTranslations('DashPage.CourseLearners')
  const locale = useLocale()
  const { courseStructure } = useCourse()
  const courseId = stripEntityPrefix(courseStructure?.course_uuid ?? '')
  const queryClient = useQueryClient()
  const { toastApiError } = useApiError()
  const archived = isCourseArchived(courseStructure)
  const allowed = (courseStructure?.allowed_actions as string[] | undefined) ?? []
  // Roster managers (creator, active maintainer, platform manager) on an open course.
  const canManage = allowed.includes('manage_contributors')

  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search.trim(), 300)
  const roster = useInfiniteQuery({
    queryKey: queryKeys.courses.roster(courseId, q),
    queryFn: ({ pageParam }) =>
      listCourseLearners(courseId, {
        limit: PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
        ...(q ? { q } : {}),
      }),
    initialPageParam: '',
    getNextPageParam: page => page.next_cursor ?? undefined,
    enabled: Boolean(courseId),
  })
  const learners = roster.data?.pages.flatMap(page => page.items) ?? []
  const groups = useQuery({
    queryKey: queryKeys.courses.usergroups(courseId),
    queryFn: () => usergroupsForCourse(courseId),
    enabled: Boolean(courseId),
  })
  const linkedGroups = groups.data ?? []

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.courses.roster(courseId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.courses.learners(courseId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.grading.gradebook(courseId) }),
    ])

  // ── enrol ──────────────────────────────────────────────────────────────
  const [pasted, setPasted] = useState('')
  const [csv, setCsv] = useState<{ name: string; identifiers: string[]; preview: EnrollLearnersResponse } | null>(null)
  const [report, setReport] = useState<EnrollLearnersResponse | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const enrol = useMutation({
    mutationFn: ({ identifiers, dryRun }: { identifiers: string[]; dryRun: boolean }) =>
      enrollCourseLearners(courseId, { identifiers, dry_run: dryRun }),
    onSettled: (_data, _error, { dryRun }) => (dryRun ? undefined : refresh()),
  })

  const tooMany = (count: number) => {
    if (count <= MAX_ROSTER_IDENTIFIERS) return false
    toast.error(t('tooMany', { max: MAX_ROSTER_IDENTIFIERS, count }))
    return true
  }

  const submitPasted = async () => {
    const identifiers = parsePastedIdentifiers(pasted)
    if (identifiers.length === 0 || tooMany(identifiers.length)) return
    try {
      const result = await enrol.mutateAsync({ identifiers, dryRun: false })
      setReport(result)
      setCsv(null)
      setPasted('')
      announce(result)
    } catch (error) {
      toastApiError(error, undefined, t('enrolFailed'))
    }
  }

  const pickCsv = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = ''
    if (!file) return
    if (file.size > MAX_CSV_BYTES) {
      toast.error(t('csvTooLarge'))
      return
    }
    const identifiers = parseRosterCsv(decodeCsv(await file.arrayBuffer()))
    if (identifiers.length === 0) {
      toast.error(t('csvEmpty'))
      return
    }
    if (tooMany(identifiers.length)) return
    try {
      const preview = await enrol.mutateAsync({ identifiers, dryRun: true })
      setCsv({ name: file.name, identifiers, preview })
      setReport(null)
    } catch (error) {
      toastApiError(error, undefined, t('enrolFailed'))
    }
  }

  const confirmCsv = async () => {
    if (!csv) return
    try {
      const result = await enrol.mutateAsync({ identifiers: csv.identifiers, dryRun: false })
      setReport(result)
      setCsv(null)
      announce(result)
    } catch (error) {
      toastApiError(error, undefined, t('enrolFailed'))
    }
  }

  const announce = (result: EnrollLearnersResponse) => {
    const enrolled = result.results.filter(r => r.outcome === 'enrolled').length
    if (enrolled > 0) toast.success(t('enrolledToast', { count: enrolled }))
    else toast.info(t('nobodyEnrolledToast'))
  }

  // ── remove ─────────────────────────────────────────────────────────────
  const [removeTarget, setRemoveTarget] = useState<CourseLearner | null>(null)
  const remove = useMutation({
    mutationFn: (userId: string) => removeCourseLearner(courseId, userId),
    onSettled: refresh,
  })
  const confirmRemove = async () => {
    const target = removeTarget
    setRemoveTarget(null)
    if (!target) return
    try {
      await remove.mutateAsync(target.user_id)
      toast.success(t('removedToast', { name: target.display_name || target.username }))
    } catch (error) {
      if (hasErrorCode(error, 'not-found')) toast.info(t('alreadyRemoved'))
      else toastApiError(error, undefined, t('removeFailed'))
    }
  }

  // ── export ─────────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false)
  const exportCsv = async () => {
    setExporting(true)
    try {
      const all = await collectPages(cursor =>
        listCourseLearners(courseId, { limit: 100, ...(cursor ? { cursor } : {}) }),
      )
      const rows = all.map(l => [
        l.display_name,
        l.username,
        l.email,
        unixToIso(l.enrolled_at_unix)?.slice(0, 10) ?? '',
        l.progress_pct === null ? '' : Math.round(l.progress_pct),
      ])
      const header = [t('colName'), t('colUsername'), t('colEmail'), t('colEnrolled'), `${t('colProgress')}, %`]
      const name = (courseStructure?.name || 'course').replace(/[\\/:*?"<>|]+/g, '_')
      saveBlob(csvBlob([header, ...rows], locale), `${name} - ${t('exportFileSuffix')}.csv`)
    } catch (error) {
      toastApiError(error, undefined, t('exportFailed'))
    }
    // No `finally`: the React Compiler skips components that use one.
    setExporting(false)
  }

  if (!courseStructure) return null
  const busy = enrol.isPending

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <CourseEditorSection title={t('enrolTitle')} description={t('enrolDescription')}>
          {courseStructure.public ? null : (
            <CourseEditorNotice icon={GraduationCap} title={t('privateTitle')} description={t('privateDescription')} />
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="roster-paste" className="text-sm font-medium">
                {t('pasteLabel')}
              </label>
              <Textarea
                id="roster-paste"
                rows={5}
                value={pasted}
                placeholder={t('pastePlaceholder')}
                onChange={e => setPasted(e.target.value)}
                disabled={busy}
              />
              <div>
                <Button onClick={() => void submitPasted()} disabled={busy || pasted.trim() === ''}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                  {t('enrolButton')}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t('csvLabel')}</span>
              <p className="text-muted-foreground text-sm">{t('csvHelp', { max: MAX_ROSTER_IDENTIFIERS })}</p>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                data-testid="roster-csv-input"
                onChange={e => void pickCsv(e.target.files?.[0])}
              />
              <div>
                <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
                  <FileUp className="size-4" />
                  {t('csvButton')}
                </Button>
              </div>
            </div>
          </div>

          {csv ? (
            <div className="flex flex-col gap-3 rounded-lg border p-4" data-testid="roster-csv-preview">
              <div className="font-medium">{t('previewTitle', { file: csv.name, count: csv.identifiers.length })}</div>
              <OutcomeSummary response={csv.preview} />
              <OutcomeTable response={csv.preview} />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void confirmCsv()}
                  disabled={busy || !csv.preview.results.some(r => r.outcome === 'enrolled')}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                  {t('confirmImport', {
                    count: csv.preview.results.filter(r => r.outcome === 'enrolled').length,
                  })}
                </Button>
                <Button variant="ghost" onClick={() => setCsv(null)} disabled={busy}>
                  {t('cancelImport')}
                </Button>
              </div>
            </div>
          ) : null}

          {report ? (
            <div className="flex flex-col gap-3 rounded-lg border p-4" data-testid="roster-report" aria-live="polite">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{t('reportTitle')}</div>
                <Button size="sm" variant="ghost" onClick={() => setReport(null)}>
                  {t('closeReport')}
                </Button>
              </div>
              <OutcomeSummary response={report} />
              <OutcomeTable response={report} />
            </div>
          ) : null}
        </CourseEditorSection>
      ) : null}

      <CourseEditorSection
        title={t('rosterTitle')}
        description={t('rosterDescription')}
        headerContent={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-md">
              <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
              <Input
                className="pl-8"
                type="search"
                value={search}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchPlaceholder')}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting || learners.length === 0}>
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {t('exportButton')}
            </Button>
          </div>
        }
      >
        {linkedGroups.length > 0 ? (
          <CourseEditorNotice
            icon={Users}
            title={t('groupsTitle')}
            description={t('groupsDescription', { groups: linkedGroups.map(g => g.name).join(', ') })}
          />
        ) : null}
        {!canManage && !archived ? (
          <CourseEditorNotice icon={Users} title={t('readOnlyTitle')} description={t('readOnlyDescription')} />
        ) : null}
        {roster.isError ? <InlineError description={t('loadFailed')} error={roster.error} /> : null}

        <AlertDialog open={removeTarget !== null} onOpenChange={open => !open && setRemoveTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-muted text-foreground">
                <Users className="size-8" />
              </AlertDialogMedia>
              <AlertDialogTitle>
                {t('removeTitle', { name: removeTarget?.display_name || removeTarget?.username || '' })}
              </AlertDialogTitle>
              <AlertDialogDescription>{t('removeDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel />
              <AlertDialogAction variant="destructive" onClick={() => void confirmRemove()}>
                {t('removeButton')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {roster.isPending ? (
          <div className="text-muted-foreground py-6 text-center text-sm">{t('loading')}</div>
        ) : learners.length === 0 && !roster.isError ? (
          <div className="text-muted-foreground py-6 text-center text-sm">{q ? t('noMatches') : t('empty')}</div>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('colLearner')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('colEmail')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('colEnrolled')}</TableHead>
                  <TableHead className="text-right">{t('colProgress')}</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">{t('colActions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {learners.map(learner => (
                  <TableRow key={learner.user_id} data-testid={`learner-${learner.username}`}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <UserAvatar
                          size="sm"
                          variant="outline"
                          avatar_url={
                            learner.avatar_key ? getUserAvatarMediaDirectory(learner.user_id, learner.avatar_key) : ''
                          }
                          {...(learner.avatar_key ? {} : { predefined_avatar: 'empty' })}
                          userId={learner.user_id}
                          username={learner.username}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{learner.display_name || learner.username}</div>
                          <div className="text-muted-foreground truncate text-xs">@{learner.username}</div>
                          <div className="text-muted-foreground truncate text-xs md:hidden">{learner.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                      {learner.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
                      {formatDate(unixToIso(learner.enrolled_at_unix) ?? '', locale)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {learner.progress_pct === null ? '—' : `${Math.round(learner.progress_pct)}%`}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && learner.allowed_actions.includes('remove') ? (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t('removeAria', { name: learner.display_name || learner.username })}
                          disabled={remove.isPending}
                          onClick={() => setRemoveTarget(learner)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {roster.hasNextPage ? (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => void roster.fetchNextPage()} disabled={roster.isFetchingNextPage}>
              {roster.isFetchingNextPage ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('showMore')}
            </Button>
          </div>
        ) : null}
      </CourseEditorSection>
    </div>
  )
}

function OutcomeSummary({ response }: { response: EnrollLearnersResponse }) {
  const t = useTranslations('DashPage.CourseLearners')
  const counts = OUTCOMES.map(outcome => ({
    outcome,
    count: response.results.filter(r => r.outcome === outcome).length,
  })).filter(c => c.count > 0)
  return (
    <div className="flex flex-wrap gap-2">
      {counts.map(({ outcome, count }) => (
        <Badge key={outcome} variant="outline" className={getCourseWorkflowToneClass(outcomeTone(outcome))}>
          {outcomeLabel(t, outcome, response.dry_run)}: {count}
        </Badge>
      ))}
    </div>
  )
}

function OutcomeTable({ response }: { response: EnrollLearnersResponse }) {
  const t = useTranslations('DashPage.CourseLearners')
  return (
    <ScrollArea className="max-h-72 rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>{t('colIdentifier')}</TableHead>
            <TableHead className="hidden sm:table-cell">{t('colLearner')}</TableHead>
            <TableHead>{t('colStatus')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {response.results.map((row, index) => (
            <TableRow key={index}>
              <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
              <TableCell className="max-w-48 truncate">{row.identifier}</TableCell>
              <TableCell className="hidden sm:table-cell">
                {row.user ? `${row.user.display_name || row.user.username} (@${row.user.username})` : '—'}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={getCourseWorkflowToneClass(outcomeTone(row.outcome))}>
                  {outcomeLabel(t, row.outcome, response.dry_run)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}

function outcomeLabel(t: ReturnType<typeof useTranslations>, outcome: EnrollOutcome, dryRun: boolean) {
  return outcome === 'enrolled' && dryRun ? t('outcome.will_enrol') : t(`outcome.${outcome}`)
}
