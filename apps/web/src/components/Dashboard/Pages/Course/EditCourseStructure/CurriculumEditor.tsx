'use client'

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDndAnnouncements } from '@/hooks/useDndAnnouncements'
import { AlertTriangle, BookOpen, CheckCircle2, GripVertical, Hexagon, Loader2 } from 'lucide-react'
import { useChapterMutations } from '@/hooks/mutations/useChapterMutations'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CourseEditorSection } from '@/features/courses/editor/components/CourseEditorSection'
import { useCourse } from '@components/Contexts/CourseContext'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { getErrorMessage } from '@/types/shared'

import type { CourseOrderPayload } from '@/schemas/chapterSchemas'
import ChapterElement from './DraggableElements/ChapterElement'

type DndItemType = 'chapter' | 'activity'

interface DndData {
  type: DndItemType
  chapterUuid?: string
  chapter?: AppChapter
  activity?: AppActivity
}

type ActiveDragData = { type: 'chapter'; chapter: AppChapter } | { type: 'activity'; activity: AppActivity }

const CurriculumEditor = () => {
  const t = useTranslations('CourseEdit.Structure')

  const course = useCourse()
  const course_structure = course.courseStructure
  const { course_uuid } = course_structure
  const { createChapter, reorderStructure } = useChapterMutations(course_uuid, true)

  const [showChapterInput, setShowChapterInput] = useState(false)
  const [newChapterName, setNewChapterName] = useState('')
  const [isCreatingChapter, setIsCreatingChapter] = useState(false)
  const newChapterInputRef = useRef<HTMLInputElement>(null)

  const [structureStatus, setStructureStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [activeDragType, setActiveDragType] = useState<DndItemType | null>(null)
  const [activeDragData, setActiveDragData] = useState<ActiveDragData | null>(null)

  // ── Local optimistic structure ────────────────────────────────────────────
  // Mirrors course_structure but updated eagerly in handleDragOver for live
  // cross-chapter activity preview. Re-syncs from the server after each drag.
  const [localStructure, _setLocalStructure] = useState<AppCourse>(course_structure)
  const localStructureRef = useRef<AppCourse>(course_structure)
  const isDraggingRef = useRef(false)

  // Stable setter that keeps the ref and React state in sync
  const setLocalStructure = useCallback((updater: ((prev: AppCourse) => AppCourse) | AppCourse) => {
    const next = typeof updater === 'function' ? updater(localStructureRef.current) : updater
    localStructureRef.current = next
    _setLocalStructure(next)
  }, [])

  // Sync from server only when not dragging (prevents reverting an in-flight drag)
  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalStructure(course_structure)
    }
  }, [course_structure, setLocalStructure])
  // ─────────────────────────────────────────────────────────────────────────

  const chapterIds = useMemo(
    () =>
      (localStructure.chapters ?? [])
        .map((chapter: AppChapter) => chapter.chapter_uuid)
        .filter((uuid): uuid is string => Boolean(uuid)),
    [localStructure.chapters],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const announcements = useDndAnnouncements(chapterIds)

  useEffect(() => {
    if (structureStatus !== 'saved') return
    const timer = setTimeout(() => setStructureStatus('idle'), 3000)
    return () => clearTimeout(timer)
  }, [structureStatus])

  useEffect(() => {
    if (!showChapterInput) return
    newChapterInputRef.current?.focus()
  }, [showChapterInput])

  const handleStartNewChapter = () => {
    setShowChapterInput(true)
    setNewChapterName('')
  }

  const handleCancelNewChapter = () => {
    setShowChapterInput(false)
    setNewChapterName('')
  }

  const handleSubmitNewChapter = async () => {
    const name = newChapterName.trim()

    if (!name) {
      handleCancelNewChapter()
      return
    }

    setIsCreatingChapter(true)

    try {
      await createChapter({ name, course_uuid })
      toast.success(t('chapterCreatedSuccess'))
      setShowChapterInput(false)
      setNewChapterName('')
    } catch {
      toast.error(t('chapterCreateFailed'))
    } finally {
      setIsCreatingChapter(false)
    }
  }

  const handleChapterInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleSubmitNewChapter()
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelNewChapter()
    }
  }

  const buildPayload = (newCourseStructure: AppCourse): CourseOrderPayload => ({
    chapter_order_by_uuids: (newCourseStructure.chapters ?? [])
      .filter((chapter: AppChapter) => Boolean(chapter.chapter_uuid))
      .map((chapter: AppChapter) => ({
        chapter_uuid: chapter.chapter_uuid || '',
        activities_order_by_uuids: (chapter.activities ?? [])
          .filter((activity: AppActivity) => Boolean(activity.activity_uuid))
          .map((activity: AppActivity) => activity.activity_uuid || ''),
      })),
  })

  const saveStructure = async (newCourseStructure: AppCourse) => {
    const payload = buildPayload(newCourseStructure)

    try {
      setStructureStatus('saving')
      await reorderStructure(newCourseStructure, payload)
      setStructureStatus('saved')
    } catch (error: unknown) {
      setStructureStatus('error')
      toast.error(getErrorMessage(error, t('saveOrderError')))
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as DndData | undefined
    isDraggingRef.current = true
    setActiveDragType(data?.type ?? null)

    if (data?.type === 'chapter' && data.chapter) {
      setActiveDragData({ type: 'chapter', chapter: data.chapter })
    } else if (data?.type === 'activity' && data.activity) {
      setActiveDragData({ type: 'activity', activity: data.activity })
    }
  }

  // Handles live optimistic preview for cross-chapter activity moves only.
  // Same-chapter reordering and chapter reordering are shown via dnd-kit's own
  // CSS transforms and are committed to state in handleDragEnd.
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)

    const activeData = active.data.current as DndData | undefined
    const overData = over.data.current as DndData | undefined

    if (activeData?.type !== 'activity') return

    // Find where this activity currently lives (may have already moved in a prior dragOver)
    const sourceChapter = (localStructureRef.current.chapters ?? []).find((c: AppChapter) =>
      (c.activities ?? []).some((a: AppActivity) => a.activity_uuid === activeId),
    )
    if (!sourceChapter) return

    // Determine the destination chapter
    let destChapterUuid: string | undefined
    if (overData?.type === 'chapter') {
      destChapterUuid = overId
    } else if (overData?.type === 'activity') {
      const overChapter = (localStructureRef.current.chapters ?? []).find((c: AppChapter) =>
        (c.activities ?? []).some((a: AppActivity) => a.activity_uuid === overId),
      )
      destChapterUuid = overChapter?.chapter_uuid
    }

    // Same chapter — skip. dnd-kit CSS transforms already provide the visual
    // feedback; we commit the final order in handleDragEnd via arrayMove.
    if (!destChapterUuid || sourceChapter.chapter_uuid === destChapterUuid) return

    // Cross-chapter move: update local structure for live visual preview
    setLocalStructure(prev => {
      const next = structuredClone(prev)

      const src = (next.chapters ?? []).find((c: AppChapter) => c.chapter_uuid === sourceChapter.chapter_uuid)
      const dst = (next.chapters ?? []).find((c: AppChapter) => c.chapter_uuid === destChapterUuid)
      if (!src || !dst) return prev

      src.activities ??= []
      dst.activities ??= []

      const srcIndex = src.activities.findIndex((a: AppActivity) => a.activity_uuid === activeId)
      if (srcIndex === -1) return prev

      const [moved] = src.activities.splice(srcIndex, 1)
      if (!moved) return prev

      // Insert before the hovered activity, or append when dropping on the chapter header
      let dstIndex = dst.activities.length
      if (overData?.type === 'activity') {
        const overIndex = dst.activities.findIndex((a: AppActivity) => a.activity_uuid === overId)
        if (overIndex !== -1) dstIndex = overIndex
      }
      dst.activities.splice(dstIndex, 0, moved)

      return next
    })
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    isDraggingRef.current = false
    setActiveDragType(null)
    setActiveDragData(null)

    const { active, over } = event

    if (!over) {
      // Dropped outside any droppable — revert to the last server state
      setLocalStructure(course_structure)
      return
    }

    const activeId = String(active.id)
    const overId = String(over.id)

    if (activeId === overId) return

    const activeData = active.data.current as DndData | undefined

    // Work on a clone of the current local structure, which already has any
    // cross-chapter activity moves applied by handleDragOver.
    const finalStructure = structuredClone(localStructureRef.current)

    if (activeData?.type === 'chapter') {
      // Apply chapter reordering using arrayMove (CSS transforms showed the preview)
      const chapters = finalStructure.chapters ?? []
      const oldIndex = chapters.findIndex((c: AppChapter) => c.chapter_uuid === activeId)
      const newIndex = chapters.findIndex((c: AppChapter) => c.chapter_uuid === overId)

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

      finalStructure.chapters = arrayMove(chapters, oldIndex, newIndex)
    } else if (activeData?.type === 'activity') {
      // Find where the activity currently is (may be different from origin after cross-chapter dragOver)
      const finalChapters = finalStructure.chapters ?? []
      const srcChapter = finalChapters.find((c: AppChapter) =>
        (c.activities ?? []).some((a: AppActivity) => a.activity_uuid === activeId),
      )
      const dstChapter = finalChapters.find((c: AppChapter) =>
        (c.activities ?? []).some((a: AppActivity) => a.activity_uuid === overId),
      )

      if (srcChapter && dstChapter && srcChapter.chapter_uuid === dstChapter.chapter_uuid) {
        // Same-chapter reorder: CSS transforms showed the preview; commit with arrayMove
        srcChapter.activities ??= []
        const srcIndex = srcChapter.activities.findIndex((a: AppActivity) => a.activity_uuid === activeId)
        const dstIndex = srcChapter.activities.findIndex((a: AppActivity) => a.activity_uuid === overId)

        if (srcIndex !== -1 && dstIndex !== -1 && srcIndex !== dstIndex) {
          srcChapter.activities = arrayMove(srcChapter.activities, srcIndex, dstIndex)
        }
      }
      // Cross-chapter: localStructure was already updated optimistically in
      // handleDragOver — nothing more to do here before saving.
    }

    setLocalStructure(finalStructure)
    await saveStructure(finalStructure)
  }

  const handleDragCancel = () => {
    isDraggingRef.current = false
    setActiveDragType(null)
    setActiveDragData(null)
    // Snap back to last known server state
    setLocalStructure(course_structure)
  }

  if (!course) return null

  return (
    <CourseEditorSection title={t('title')} description={t('curriculumInlineFeedback')} contentClassName="gap-4">
      {structureStatus !== 'idle' && (
        <Alert className="border-border bg-muted/40 mb-4">
          {structureStatus === 'saving' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : structureStatus === 'error' ? (
            <AlertTriangle className="size-4" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          <AlertTitle>
            {structureStatus === 'saving'
              ? t('savingOrder')
              : structureStatus === 'error'
                ? t('saveOrderError')
                : t('curriculumChangesApplyImmediately')}
          </AlertTitle>
          <AlertDescription>
            {structureStatus === 'error' ? t('refreshAfterError') : t('curriculumInlineFeedback')}
          </AlertDescription>
        </Alert>
      )}

      {(localStructure.chapters ?? []).length === 0 && !showChapterInput ? (
        <div className="bg-muted/20 mb-4 flex flex-col items-center rounded-xl border border-dashed p-6 text-center">
          <div className="bg-muted mb-4 flex h-12 w-12 items-center justify-center rounded-xl">
            <BookOpen className="text-muted-foreground h-6 w-6" />
          </div>
          <p className="text-foreground mb-1 text-sm font-semibold">{t('emptyStateTitle')}</p>
          <p className="text-muted-foreground mb-4 max-w-xs text-sm">{t('emptyStateDescription')}</p>
        </div>
      ) : (
        <DndContext
          id="curriculum-editor"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={event => void handleDragEnd(event)}
          onDragCancel={handleDragCancel}
          accessibility={{ announcements }}
        >
          <SortableContext items={chapterIds} strategy={verticalListSortingStrategy}>
            <div className={cn('space-y-4', activeDragType === 'chapter' && 'rounded-xl bg-muted/20')}>
              {(localStructure.chapters ?? []).map((chapter: AppChapter, index: number) => (
                <ChapterElement
                  key={chapter.chapter_uuid}
                  chapterIndex={index}
                  course_uuid={course_uuid}
                  chapter={chapter as never}
                  isDraggingActivity={activeDragType === 'activity'}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeDragData?.type === 'chapter' ? (
              <ChapterDragOverlay chapter={activeDragData.chapter} />
            ) : activeDragData?.type === 'activity' ? (
              <ActivityDragOverlay activity={activeDragData.activity} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <div className="mt-4">
        {showChapterInput ? (
          <div className="border-primary/50 bg-muted/30 flex items-center gap-2 rounded-xl border border-dashed px-4 py-3">
            <Hexagon className="text-muted-foreground size-4 shrink-0" strokeWidth={2.5} />
            <Input
              ref={newChapterInputRef}
              value={newChapterName}
              onChange={e => setNewChapterName(e.target.value)}
              onKeyDown={handleChapterInputKeyDown}
              placeholder={t('chapterNamePlaceholder')}
              className="h-8 flex-1 text-sm"
              disabled={isCreatingChapter}
            />
            <Button
              size="sm"
              onClick={() => void handleSubmitNewChapter()}
              disabled={isCreatingChapter || !newChapterName.trim()}
              className="h-8"
            >
              {isCreatingChapter ? <Loader2 className="size-4 animate-spin" /> : t('confirmChapter')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancelNewChapter}
              disabled={isCreatingChapter}
              className="h-8"
            >
              {t('cancel')}
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="w-full rounded-xl border-dashed py-5" onClick={handleStartNewChapter}>
            <Hexagon strokeWidth={3} className="mr-2 size-4" />
            {t('addChapterButton')}
          </Button>
        )}
      </div>
    </CourseEditorSection>
  )
}

// ── Drag overlay previews ─────────────────────────────────────────────────────
// Purely presentational — no hooks, no mutations. Render a faithful clone of the
// actual card so the user always sees what they're dragging.

const ChapterDragOverlay = ({ chapter }: { chapter: AppChapter }) => (
  <div className="bg-card ring-ring/20 flex cursor-grabbing items-center gap-3 rounded-xl border px-4 py-3 opacity-95 shadow-2xl ring-2">
    <GripVertical className="text-muted-foreground size-5 shrink-0" />
    <div className="bg-muted shrink-0 rounded-lg p-2">
      <Hexagon className="text-muted-foreground h-4 w-4" strokeWidth={2.5} />
    </div>
    <span className="text-foreground truncate text-sm font-medium">{chapter.name}</span>
    <span className="bg-muted text-muted-foreground ml-auto rounded-full px-2 py-0.5 text-xs font-medium">
      {(chapter.activities ?? []).length}
    </span>
  </div>
)

const ActivityDragOverlay = ({ activity }: { activity: AppActivity }) => (
  <div className="bg-card ring-ring/20 flex cursor-grabbing items-center gap-3 rounded-lg border p-3 opacity-95 shadow-2xl ring-2">
    <GripVertical className="text-muted-foreground size-5 shrink-0" />
    <span className="text-foreground truncate text-sm font-medium">{activity.name}</span>
  </div>
)

export default CurriculumEditor
