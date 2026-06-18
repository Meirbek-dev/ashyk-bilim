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
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, Check, GripVertical, Hexagon, Loader2, Pencil, Trash2, X as XIcon } from 'lucide-react'
import { useChapterMutations } from '@/hooks/mutations/useChapterMutations'
import ToolTip from '@/components/Objects/Elements/Tooltip/Tooltip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/types/shared'

import NewActivityButton from '@/components/Dashboard/Pages/Course/EditCourseStructure/Buttons/NewActivityButton'
import ActivityElement from './ActivityElement'

type ActivityType =
  | 'TYPE_VIDEO'
  | 'TYPE_DOCUMENT'
  | 'TYPE_FILE_SUBMISSION'
  | 'TYPE_DYNAMIC'
  | 'TYPE_EXAM'
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
  [key: string]: unknown
}

interface Chapter {
  id?: number
  chapter_uuid?: string
  name?: string
  activities?: Activity[]
}

interface ChapterElementProps {
  chapter: Chapter
  chapterIndex: number
  course_uuid: string
  /** True while the user is dragging any activity — used to highlight drop zones */
  isDraggingActivity?: boolean
}

interface SortableActivityElementProps {
  activity: Activity
  activityIndex: number
  course_uuid: string
  chapterUuid: string
}

const SortableActivityElement = ({
  activity,
  activityIndex,
  course_uuid,
  chapterUuid,
}: SortableActivityElementProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: activity.activity_uuid,
    data: {
      type: 'activity',
      chapterUuid,
      activity,
    },
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        // CSS.Translate avoids the scaleX/Y artifacts that CSS.Transform includes
        transform: CSS.Translate.toString(transform),
        // Skip transition on the actively dragged item — it should snap instantly
        transition: isDragging ? undefined : transition,
      }}
      className={cn(isDragging && 'opacity-30')}
    >
      <ActivityElement
        course_uuid={course_uuid}
        activityIndex={activityIndex}
        activity={activity}
        isDragging={isDragging}
        attributes={attributes}
        listeners={listeners}
      />
    </div>
  )
}

const ChapterElement = ({
  chapter,
  chapterIndex: _chapterIndex,
  course_uuid,
  isDraggingActivity,
}: ChapterElementProps) => {
  const { deleteChapter, updateChapter } = useChapterMutations(course_uuid, true)
  const t = useTranslations('CourseEdit')

  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(chapter?.name ?? '')
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [isDeletingChapter, setIsDeletingChapter] = useState(false)

  const activities = useMemo(() => chapter.activities ?? [], [chapter.activities])

  // Filter out any activities without a valid uuid to prevent phantom sortable entries
  const activityIds = useMemo(
    () => activities.filter(a => Boolean(a.activity_uuid)).map(a => a.activity_uuid),
    [activities],
  )

  const publishedCount = activities.filter(activity => activity.published).length
  const draftCount = activities.length - publishedCount

  const chapterUuid = chapter.chapter_uuid || ''
  const chapterName = chapter.name || ''
  const chapterId = chapter.id ?? 0

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chapterUuid,
    data: {
      type: 'chapter',
      chapter,
    },
  })

  // Note: useDroppable with the same chapterUuid is intentionally NOT used here.
  // The useSortable above already registers this node as a droppable, and dual-
  // registration with the same id would silently corrupt the droppable map.
  // Cross-chapter activity drops are detected via overData.type === 'chapter'
  // in CurriculumEditor's handleDragOver/handleDragEnd.

  const handleStartEdit = () => {
    setEditedName(chapterName)
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditedName(chapterName)
  }

  const handleSaveEdit = async () => {
    const trimmedName = editedName.trim()

    if (!trimmedName || trimmedName === chapterName) {
      handleCancelEdit()
      return
    }

    setIsSavingEdit(true)

    try {
      await updateChapter(chapterUuid, { name: trimmedName })
      setIsEditing(false)
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t('chapterUpdateFailed')))
      setEditedName(chapterName)
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleDeleteChapter = async () => {
    setIsDeletingChapter(true)

    try {
      await deleteChapter(chapterUuid)
      setIsDeleteDialogOpen(false)
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t('chapterDeleteFailed')))
      setIsDeleteDialogOpen(false)
    } finally {
      setIsDeletingChapter(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleSaveEdit()
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
  }

  if (!chapterUuid) {
    return null
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        // CSS.Translate avoids the scaleX/Y artifacts from CSS.Transform
        transform: CSS.Translate.toString(transform),
        // Don't animate the item being actively dragged — it should appear fixed
        transition: isDragging ? undefined : transition,
      }}
      className={cn(
        'mb-4 rounded-xl border bg-card shadow-sm transition-all duration-200',
        isDragging ? 'opacity-70 shadow-2xl ring-2 ring-ring/30' : 'hover:shadow-md',
      )}
    >
      <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-6">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab active:cursor-grabbing"
          aria-label={t('dragChapter')}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-5" aria-hidden />
        </Button>

        <div className="bg-muted shrink-0 rounded-lg p-2">
          <Hexagon className="text-muted-foreground h-4 w-4" strokeWidth={2.5} />
        </div>

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-1.5">
              <Input
                type="text"
                value={editedName}
                onChange={e => setEditedName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('chapterNamePlaceholder')}
                className="h-8 text-sm"
                disabled={isSavingEdit}
              />

              <ToolTip content={t('save')} side="top">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 p-0 text-emerald-600 hover:text-emerald-700"
                  onClick={() => void handleSaveEdit()}
                  disabled={isSavingEdit}
                  aria-label={t('save')}
                >
                  {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
              </ToolTip>

              <ToolTip content={t('cancel')} side="top">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 p-0"
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
              <span className="text-foreground truncate text-sm font-medium sm:text-base">{chapterName}</span>
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                {activities.length}
              </span>

              <ToolTip content={t('edit')} side="top">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground h-7 w-7 shrink-0 p-0"
                  onClick={handleStartEdit}
                  aria-label={t('edit')}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </ToolTip>
            </div>
          )}
        </div>

        {!isEditing && (
          <ToolTip content={t('deleteChapterButton')} side="top">
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive h-8 w-8 shrink-0 p-0"
              onClick={() => setIsDeleteDialogOpen(true)}
              aria-label={t('deleteChapterButton')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </ToolTip>
        )}

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-muted text-foreground">
                <AlertTriangle className="size-8" />
              </AlertDialogMedia>
              <AlertDialogTitle>{t('deleteChapterTitle', { name: chapterName })}</AlertDialogTitle>
              <AlertDialogDescription>
                {activities.length > 0
                  ? t('deleteChapterConfirmationBreakdown', {
                      count: activities.length,
                      published: publishedCount,
                      drafts: draftCount,
                    })
                  : t('deleteChapterConfirmation')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingChapter} />
              <AlertDialogAction variant="destructive" onClick={handleDeleteChapter} disabled={isDeletingChapter}>
                {isDeletingChapter ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('deleting')}
                  </>
                ) : (
                  t('deleteChapterButton')
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <SortableContext items={activityIds} strategy={verticalListSortingStrategy}>
        <div
          className={cn(
            'min-h-[80px] rounded-lg px-4 py-3 transition-colors',
            // Subtle tint on the entire activities area while any activity is being
            // dragged — signals this chapter is a valid drop target without needing
            // a separate useDroppable registration.
            isDraggingActivity && 'bg-muted/30',
          )}
        >
          {activities.length > 0 ? (
            activities.map((activity, index) => (
              <SortableActivityElement
                key={activity.activity_uuid}
                course_uuid={course_uuid}
                chapterUuid={chapterUuid}
                activityIndex={index}
                activity={activity}
              />
            ))
          ) : (
            <div className="flex min-h-[60px] flex-col items-center justify-center gap-1 py-4 text-center">
              <p className="text-muted-foreground text-sm font-medium">{t('noActivities')}</p>
            </div>
          )}
        </div>
      </SortableContext>

      <div className="px-4 pb-4">
        <NewActivityButton chapterId={chapterId} />
      </div>
    </div>
  )
}

export default ChapterElement
