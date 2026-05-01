'use client';

import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { AlertTriangle, BookOpen, CheckCircle2, Hexagon, Loader2 } from 'lucide-react';
import { useChapterMutations } from '@/hooks/mutations/useChapterMutations';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCourse } from '@components/Contexts/CourseContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import type { CourseOrderPayload } from '@/schemas/chapterSchemas';
import ChapterElement from './DraggableElements/ChapterElement';

type DndItemType = 'chapter' | 'activity';

interface DndData {
  type: DndItemType;
  chapterUuid?: string;
}

const CurriculumEditor = () => {
  const t = useTranslations('CourseEdit.Structure');

  const course = useCourse();
  const course_structure = course.courseStructure;
  const { course_uuid } = course_structure;
  const { createChapter, reorderStructure } = useChapterMutations(course_uuid, true);

  const [showChapterInput, setShowChapterInput] = useState(false);
  const [newChapterName, setNewChapterName] = useState('');
  const [isCreatingChapter, setIsCreatingChapter] = useState(false);
  const newChapterInputRef = useRef<HTMLInputElement>(null);

  const [structureStatus, setStructureStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [activeDragType, setActiveDragType] = useState<DndItemType | null>(null);

  const chapterIds = useMemo(
    () => course_structure.chapters.map((chapter: any) => chapter.chapter_uuid),
    [course_structure.chapters],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    if (structureStatus !== 'saved') return;

    const timer = setTimeout(() => setStructureStatus('idle'), 3000);
    return () => clearTimeout(timer);
  }, [structureStatus]);

  useEffect(() => {
    if (!showChapterInput) return;
    newChapterInputRef.current?.focus();
  }, [showChapterInput]);

  const handleStartNewChapter = () => {
    setShowChapterInput(true);
    setNewChapterName('');
  };

  const handleCancelNewChapter = () => {
    setShowChapterInput(false);
    setNewChapterName('');
  };

  const handleSubmitNewChapter = async () => {
    const name = newChapterName.trim();

    if (!name) {
      handleCancelNewChapter();
      return;
    }

    setIsCreatingChapter(true);

    try {
      await createChapter({ name, course_uuid });
      toast.success(t('chapterCreatedSuccess'));
      setShowChapterInput(false);
      setNewChapterName('');
    } catch {
      toast.error(t('chapterCreateFailed'));
    } finally {
      setIsCreatingChapter(false);
    }
  };

  const handleChapterInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleSubmitNewChapter();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelNewChapter();
    }
  };

  const buildPayload = (newCourseStructure: any): CourseOrderPayload => ({
    chapter_order_by_uuids: newCourseStructure.chapters.map((chapter: any) => ({
      chapter_uuid: chapter.chapter_uuid,
      activities_order_by_uuids: (chapter.activities ?? []).map((activity: any) => activity.activity_uuid),
    })),
  });

  const findChapterByActivityUuid = (activityUuid: string) => {
    return course_structure.chapters.find((chapter: any) =>
      (chapter.activities ?? []).some((activity: any) => activity.activity_uuid === activityUuid),
    );
  };

  const findActivityLocation = (activityUuid: string) => {
    for (const chapter of course_structure.chapters) {
      const activityIndex = (chapter.activities ?? []).findIndex(
        (activity: any) => activity.activity_uuid === activityUuid,
      );

      if (activityIndex !== -1) {
        return {
          chapterUuid: chapter.chapter_uuid,
          activityIndex,
        };
      }
    }

    return null;
  };

  const saveStructure = async (newCourseStructure: any) => {
    const payload = buildPayload(newCourseStructure);

    try {
      setStructureStatus('saving');
      await reorderStructure(newCourseStructure, payload);
      setStructureStatus('saved');
    } catch (error: any) {
      setStructureStatus('error');
      toast.error(error?.message || t('saveOrderError'));
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as DndData | undefined;
    setActiveDragType(data?.type ?? null);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Keep this intentionally empty unless you want optimistic cross-chapter preview.
    // Persisting on dragEnd is simpler and avoids mutating server-backed course context locally.
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragType(null);

    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId === overId) return;

    const activeData = active.data.current as DndData | undefined;
    const overData = over.data.current as DndData | undefined;

    const newCourseStructure = structuredClone(course_structure);

    if (activeData?.type === 'chapter') {
      const oldIndex = newCourseStructure.chapters.findIndex((chapter: any) => chapter.chapter_uuid === activeId);
      const newIndex = newCourseStructure.chapters.findIndex((chapter: any) => chapter.chapter_uuid === overId);

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      newCourseStructure.chapters = arrayMove(newCourseStructure.chapters, oldIndex, newIndex);
      await saveStructure(newCourseStructure);
      return;
    }

    if (activeData?.type === 'activity') {
      const sourceLocation = findActivityLocation(activeId);
      if (!sourceLocation) return;

      const destinationChapterUuid =
        overData?.type === 'chapter'
          ? overId
          : (overData?.chapterUuid ?? findChapterByActivityUuid(overId)?.chapter_uuid ?? sourceLocation.chapterUuid);

      const sourceChapter = newCourseStructure.chapters.find(
        (chapter: any) => chapter.chapter_uuid === sourceLocation.chapterUuid,
      );

      const destinationChapter = newCourseStructure.chapters.find(
        (chapter: any) => chapter.chapter_uuid === destinationChapterUuid,
      );

      if (!sourceChapter || !destinationChapter) return;

      sourceChapter.activities ??= [];
      destinationChapter.activities ??= [];

      const sourceIndex = sourceChapter.activities.findIndex((activity: any) => activity.activity_uuid === activeId);
      if (sourceIndex === -1) return;

      const [movedActivity] = sourceChapter.activities.splice(sourceIndex, 1);
      if (!movedActivity) return;

      let destinationIndex = destinationChapter.activities.length;

      if (overData?.type === 'activity') {
        const overActivityIndex = destinationChapter.activities.findIndex(
          (activity: any) => activity.activity_uuid === overId,
        );

        if (overActivityIndex !== -1) {
          destinationIndex = overActivityIndex;
        }
      }

      destinationChapter.activities.splice(destinationIndex, 0, movedActivity);

      await saveStructure(newCourseStructure);
    }
  };

  const handleDragCancel = () => {
    setActiveDragType(null);
  };

  if (!course) return null;

  return (
    <div className="min-w-0">
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

      {course_structure.chapters.length === 0 && !showChapterInput ? (
        <div className="bg-muted/20 mb-4 flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center">
          <div className="bg-muted mb-4 flex h-12 w-12 items-center justify-center rounded-xl">
            <BookOpen className="text-muted-foreground h-6 w-6" />
          </div>
          <p className="text-foreground mb-1 text-sm font-semibold">{t('emptyStateTitle')}</p>
          <p className="text-muted-foreground mb-4 max-w-xs text-sm">{t('emptyStateDescription')}</p>
          <Button
            variant="default"
            size="sm"
            onClick={handleStartNewChapter}
          >
            <Hexagon
              strokeWidth={3}
              className="mr-2 size-4"
            />
            {t('emptyStateAction')}
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={(event) => void handleDragEnd(event)}
          onDragCancel={handleDragCancel}
        >
          <SortableContext
            items={chapterIds}
            strategy={verticalListSortingStrategy}
          >
            <div className={cn('space-y-4', activeDragType === 'chapter' && 'rounded-xl bg-muted/20')}>
              {course_structure.chapters.map((chapter: any, index: number) => (
                <ChapterElement
                  key={chapter.chapter_uuid}
                  chapterIndex={index}
                  course_uuid={course_uuid}
                  chapter={chapter}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeDragType ? (
              <div className="bg-card rounded-xl border px-4 py-3 text-sm font-medium shadow-2xl">
                {activeDragType === 'chapter' ? t('chapter') : t('activity')}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <div className="mt-4">
        {showChapterInput ? (
          <div className="border-primary/50 bg-muted/30 flex items-center gap-2 rounded-xl border border-dashed px-4 py-3">
            <Hexagon
              className="text-muted-foreground size-4 shrink-0"
              strokeWidth={2.5}
            />
            <Input
              ref={newChapterInputRef}
              value={newChapterName}
              onChange={(e) => setNewChapterName(e.target.value)}
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
          <Button
            variant="outline"
            className="w-full rounded-xl border-dashed py-5"
            onClick={handleStartNewChapter}
          >
            <Hexagon
              strokeWidth={3}
              className="mr-2 size-4"
            />
            {t('addChapterButton')}
          </Button>
        )}
      </div>
    </div>
  );
};

export default CurriculumEditor;
