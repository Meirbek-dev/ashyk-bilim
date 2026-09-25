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
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Code2,
  Eye,
  File,
  FileArchive,
  FilePenLine,
  Globe,
  GripVertical,
  Loader2,
  Lock,
  Pencil,
  LayoutTemplate,
  ListChecks,
  Trash2,
  Video,
  X as XIcon,
} from 'lucide-react'
import { CourseStatusBadge } from '@components/Dashboard/Courses/courseWorkflowUi'
import { useListCourseAssessments } from '@/lib/api/generated/assessments/assessments'
import { useActivityMutations } from '@/hooks/mutations/useActivityMutations'
import { cleanActivityUuid, cleanCourseUuid, isCourseAuthor } from '@/lib/course-management'
import type { DraggableAttributes } from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'

import ToolTip from '@/components/Objects/Elements/Tooltip/Tooltip'
import { useCourse } from '@components/Contexts/CourseContext'
import { useSession } from '@/hooks/useSession'
import { useApiError } from '@/hooks/useApiError'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import AppLink from '@/components/ui/AppLink'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

type ActivityType =
  | 'TYPE_VIDEO'
  | 'TYPE_DOCUMENT'
  | 'TYPE_FILE_SUBMISSION'
  | 'TYPE_DYNAMIC'
  | 'TYPE_EXAM'
  | 'TYPE_CUSTOM'
  | 'TYPE_CODE_CHALLENGE'

interface Activity {
  id: string
  activity_uuid: string
  activity_type: ActivityType
  name: string
  published: boolean
  can_update?: boolean
  can_delete?: boolean
  is_owner?: boolean
  is_creator?: boolean
  available_actions?: string[]
}

interface ActivityElementProps {
  activity: Activity
  activityIndex: number
  course_uuid: string
  isDragging?: boolean
  attributes?: DraggableAttributes | undefined
  listeners?: SyntheticListenerMap | undefined
}

const ACTIVITY_CONFIG = {
  TYPE_VIDEO: {
    Icon: Video,
    translationKey: 'video',
    colorClass: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300',
  },
  TYPE_DOCUMENT: {
    Icon: File,
    translationKey: 'document',
    colorClass:
      'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300',
  },
  TYPE_FILE_SUBMISSION: {
    Icon: FileArchive,
    translationKey: 'fileSubmission',
    colorClass:
      'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300',
  },
  TYPE_DYNAMIC: {
    Icon: LayoutTemplate,
    translationKey: 'dynamic',
    colorClass:
      'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300',
  },
  TYPE_EXAM: {
    Icon: ClipboardList,
    translationKey: 'exam',
    colorClass: 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300',
  },
  TYPE_CUSTOM: {
    Icon: ListChecks,
    translationKey: 'quiz',
    colorClass:
      'border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300',
  },
  TYPE_CODE_CHALLENGE: {
    Icon: Code2,
    translationKey: 'codeChallenge',
    colorClass: 'border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-300',
  },
} as const

const ACTION_ICON_BUTTON_CLASS = 'text-muted-foreground shadow-sm'

function ActivityElement({
  activity,
  activityIndex: _activityIndex,
  course_uuid,
  isDragging,
  attributes,
  listeners,
}: ActivityElementProps) {
  const { deleteActivity, updateActivity } = useActivityMutations(course_uuid, true)
  const t = useTranslations('CourseEdit.ActivityElement')
  const { toastApiError } = useApiError()
  // A scheduled assessment's activity is still unpublished on the wire; the
  // row says «Запланировано» like the studio does (UX-104). One listing per course.
  const isAssessment = ['TYPE_EXAM', 'TYPE_CUSTOM', 'TYPE_CODE_CHALLENGE'].includes(activity.activity_type)
  const assessments = useListCourseAssessments(course_uuid.replace(/^course_/, ''), {
    query: { enabled: isAssessment && !activity.published, staleTime: 5_000 },
  })
  const activityId = activity.activity_uuid.replace(/^activity_/, '')
  const assessmentLifecycle = assessments.data?.find(a => a.activity_id === activityId)?.lifecycle
  const isScheduled = assessmentLifecycle === 'scheduled'
  // BUG-171: an archived assessment's row is «В архиве», not «Черновик».
  const isArchived = assessmentLifecycle === 'archived'

  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(activity?.name ?? '')
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isUpdatingPublish, setIsUpdatingPublish] = useState(false)
  const [isUnpublishConfirmOpen, setIsUnpublishConfirmOpen] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [isDeletingActivity, setIsDeletingActivity] = useState(false)
  // UX-202: the toggle is disabled while a publish/unpublish request is in
  // flight, so focus falls to <body> — hand it back to the toggle once it is
  // enabled again (after the unpublish confirm and after a direct publish).
  const publishToggleRef = useRef<HTMLButtonElement>(null)
  const refocusToggle = useRef(false)
  useEffect(() => {
    if (isUpdatingPublish || !refocusToggle.current) return
    refocusToggle.current = false
    publishToggleRef.current?.focus()
  }, [isUpdatingPublish])

  // UX-214: the rename input takes focus when it opens; save / Esc hand it
  // back to the pencil instead of dropping it to <body>.
  const nameInputRef = useRef<HTMLInputElement>(null)
  const pencilRef = useRef<HTMLButtonElement>(null)
  const refocusPencil = useRef(false)
  useEffect(() => {
    if (isEditing) {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    } else if (refocusPencil.current) {
      refocusPencil.current = false
      pencilRef.current?.focus()
    }
  }, [isEditing])

  // v2 activities carry no `can_*` flags: derive them the way the course
  // workspace does — authorship (creator / active co-author) is the `:own`
  // scope, `<resource>:<action>:platform` covers every course.
  const { can, session } = useSession()
  const { courseStructure } = useCourse()
  const isAuthor = isCourseAuthor(courseStructure, session?.userId)
  const canUpdate = isAuthor || can('activity', 'update', 'platform')
  const canDelete = isAuthor || can('activity', 'delete', 'platform')

  const handleStartEdit = () => {
    setEditedName(activity.name)
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    refocusPencil.current = true
    setIsEditing(false)
    setEditedName(activity.name)
  }

  const handleSaveEdit = async () => {
    const trimmedName = editedName.trim()
    if (!trimmedName || trimmedName === activity.name) {
      handleCancelEdit()
      return
    }
    setIsSavingEdit(true)
    try {
      await updateActivity(activity.activity_uuid, { name: trimmedName })
      toast.success(t('activityNameUpdatedSuccess'))
      refocusPencil.current = true
      setIsEditing(false)
    } catch (error: unknown) {
      // UX-128: the assessment lock (scheduled / archived / published with
      // hand-ins) is a 409 — name the fix in the page language, not the
      // server's English `detail`.
      if (isAssessment && hasErrorCode(error, 'conflict')) toast.error(t('lockedAssessment'))
      else toastApiError(error, undefined, t('failedToUpdateActivityName'))
      setEditedName(activity.name)
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleTogglePublish = async () => {
    // The optimistic update rewrites `activity` in place — read it first.
    const unpublishing = activity.published
    setIsUnpublishConfirmOpen(false)
    setIsUpdatingPublish(true)
    const toastId = toast.loading(t('updating'))
    try {
      await updateActivity(activity.activity_uuid, {
        published: !unpublishing,
      })
      toast.success(unpublishing ? t('unpublishedToast') : t('activityUpdateSuccess'))
    } catch (error: unknown) {
      // `activity-not-ready` (file-submission config still a draft) and the
      // rest are localized through the error-code catalog.
      toastApiError(error, undefined, t('updateFailed'))
    } finally {
      toast.dismiss(toastId)
      setIsUpdatingPublish(false)
    }
  }

  const handleDeleteActivity = async () => {
    setIsDeletingActivity(true)
    const toastId = toast.loading(t('deletingActivity'))
    try {
      await deleteActivity(activity.activity_uuid)
      toast.success(t('activityDeletedSuccess'))
      setIsDeleteDialogOpen(false)
    } catch (error: unknown) {
      toastApiError(error, undefined, t('deleteFailed'))
    } finally {
      toast.dismiss(toastId)
      setIsDeletingActivity(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleSaveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
  }

  if (!activity?.activity_uuid) return null

  return (
    <div
      data-activity-element={activity.activity_uuid}
      data-activity-type={activity.activity_type}
      className={cn(
        'mb-2 flex items-center gap-3 rounded-lg border bg-card p-3 transition-all duration-200',
        isDragging ? 'shadow-xl ring-2 ring-ring/30' : 'shadow-sm hover:shadow-md',
      )}
    >
      {/* Drag Handle */}
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={activity.name}
        className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-5" aria-hidden />
      </Button>

      {/* Type Badge */}
      <ActivityTypeBadge activityType={activity.activity_type} />

      {/* Name */}
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <Input
              ref={nameInputRef}
              type="text"
              aria-label={t('activityNamePlaceholder')}
              value={editedName}
              onChange={e => setEditedName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('activityNamePlaceholder')}
              className="h-8 text-sm"
              disabled={isSavingEdit}
            />
            <ToolTip content={t('save')} side="top">
              <Button
                size="icon-sm"
                variant="outline"
                className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
                onClick={() => void handleSaveEdit()}
                disabled={isSavingEdit}
                aria-label={t('save')}
              >
                {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
            </ToolTip>
            <ToolTip content={t('cancel')} side="top">
              <Button
                size="icon-sm"
                variant="outline"
                className="shrink-0"
                onClick={handleCancelEdit}
                disabled={isSavingEdit}
                aria-label={t('cancel')}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </ToolTip>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-foreground truncate text-sm font-medium">{activity.name}</span>
            {/* UX-124: a scheduled assessment publishes itself — the badge explains why there is no toggle. */}
            {isScheduled && !activity.published ? (
              <ToolTip content={t('scheduledHint')} side="top">
                <span className="inline-flex" tabIndex={0} aria-label={t('scheduledHint')}>
                  <CourseStatusBadge status="scheduled" />
                </span>
              </ToolTip>
            ) : (
              <CourseStatusBadge status={activity.published ? 'live' : isArchived ? 'archived' : 'draft'} />
            )}
            {canUpdate && (
              <ToolTip content={t('editButton')} side="top">
                <Button
                  ref={pencilRef}
                  size="icon-sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={handleStartEdit}
                  aria-label={t('editButton')}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </ToolTip>
            )}
          </div>
        )}
      </div>

      {/* Action icons */}
      {!isEditing && (
        <div className="flex shrink-0 items-center gap-1">
          {/* Open content editor */}
          <ActivityEditButton activity={activity} course_uuid={course_uuid} />

          {/* Preview */}
          <ToolTip content={t('previewTooltip')} side="top">
            <Button
              size="icon"
              variant="outline"
              className={ACTION_ICON_BUTTON_CLASS}
              nativeButton={false}
              aria-label={t('previewTooltip')}
              render={
                <AppLink
                  href={`/course/${cleanCourseUuid(course_uuid)}/activity/${cleanActivityUuid(activity.activity_uuid)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Eye className="h-4 w-4" />
                  <span className="sr-only">{t('previewTooltip')}</span>
                </AppLink>
              }
            />
          </ToolTip>

          {/* Publish toggle — UX-120: an archived assessment publishes only after «Восстановить» in the studio (409
              otherwise); UX-124: a scheduled one publishes itself (409 `activity-not-ready` until then). */}
          {canUpdate && !isArchived && !isScheduled && (
            <ToolTip content={activity.published ? t('unpublish') : t('publish')} side="top">
              <Button
                size="icon"
                variant="outline"
                className={ACTION_ICON_BUTTON_CLASS}
                // UX-200: unpublishing cuts learners off (their hand-ins too) — confirm first.
                onClick={
                  activity.published
                    ? () => setIsUnpublishConfirmOpen(true)
                    : () => {
                        // The toggle disables itself while the request runs; hand focus back after.
                        refocusToggle.current = true
                        void handleTogglePublish()
                      }
                }
                ref={publishToggleRef}
                disabled={isUpdatingPublish}
                aria-label={activity.published ? t('unpublish') : t('publish')}
              >
                {isUpdatingPublish ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : activity.published ? (
                  <Lock className="h-4 w-4" />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
              </Button>
            </ToolTip>
          )}

          {/* Delete */}
          {canDelete && (
            <ToolTip content={t('deleteButton')} side="top">
              <Button
                size="icon"
                variant="outline"
                className="text-muted-foreground hover:text-destructive shadow-sm"
                onClick={() => setIsDeleteDialogOpen(true)}
                aria-label={t('deleteButton')}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </ToolTip>
          )}
        </div>
      )}

      <AlertDialog open={isUnpublishConfirmOpen} onOpenChange={setIsUnpublishConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('unpublishConfirmTitle', { name: activity.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t('unpublishConfirmMessage')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdatingPublish} />
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                refocusToggle.current = true
                void handleTogglePublish()
              }}
              disabled={isUpdatingPublish}
            >
              {t('unpublish')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-muted text-foreground">
              <AlertTriangle className="size-8" />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('deleteTitle', { name: activity.name })}</AlertDialogTitle>
            {/* BUG-186: deleting an assessment activity cascades its hand-ins. */}
            <AlertDialogDescription>
              {isAssessment ? t('deleteAssessmentConfirmation') : t('deleteConfirmation')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingActivity} />
            <AlertDialogAction variant="destructive" onClick={handleDeleteActivity} disabled={isDeletingActivity}>
              {isDeletingActivity ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('deleting')}
                </>
              ) : (
                t('deleteButton')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ActivityTypeBadge({ activityType }: { activityType: ActivityType }) {
  const t = useTranslations('CourseEdit.ActivityElement')
  const config = ACTIVITY_CONFIG[activityType as keyof typeof ACTIVITY_CONFIG]
  if (!config) return null
  const { Icon, translationKey, colorClass } = config
  return (
    <div className={cn('flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1', colorClass)}>
      <Icon className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">{t(`ActivityTypes.${translationKey}`)}</span>
    </div>
  )
}

function ActivityEditButton({ activity, course_uuid }: { activity: Activity; course_uuid: string }) {
  const t = useTranslations('CourseEdit.ActivityElement')
  const course = useCourse()

  if (activity.activity_type === 'TYPE_DYNAMIC') {
    // Straight to the studio: `/editor/…/edit` only redirects there (UX-029).
    const editUrl = `/dash/courses/${cleanCourseUuid(course?.courseStructure?.course_uuid ?? course_uuid)}/activity/${cleanActivityUuid(activity.activity_uuid)}/studio`
    return (
      <ToolTip content={t('editPageButton')} side="top">
        <Button
          size="icon"
          variant="outline"
          className={ACTION_ICON_BUTTON_CLASS}
          nativeButton={false}
          render={
            <AppLink href={editUrl}>
              <FilePenLine className="h-4 w-4" />
              <span className="sr-only">{t('openEditPage')}</span>
            </AppLink>
          }
        />
      </ToolTip>
    )
  }

  if (
    activity.activity_type === 'TYPE_EXAM' ||
    activity.activity_type === 'TYPE_CUSTOM' ||
    activity.activity_type === 'TYPE_CODE_CHALLENGE' ||
    activity.activity_type === 'TYPE_FILE_SUBMISSION'
  ) {
    // In-app editor: locale-prefixed, same tab (an `<a target=_blank>` lost
    // the locale and opened a second copy of the workspace).
    const editUrl = `/dash/courses/${cleanCourseUuid(course?.courseStructure?.course_uuid ?? course_uuid)}/activity/${cleanActivityUuid(activity.activity_uuid)}/studio`
    return (
      <ToolTip content={t('configureButton')} side="top">
        <Button
          size="icon"
          variant="outline"
          className={ACTION_ICON_BUTTON_CLASS}
          nativeButton={false}
          render={
            <AppLink href={editUrl}>
              <FilePenLine className="h-4 w-4" />
              <span className="sr-only">{t('openEditPage')}</span>
            </AppLink>
          }
        />
      </ToolTip>
    )
  }

  return null
}

export default ActivityElement
