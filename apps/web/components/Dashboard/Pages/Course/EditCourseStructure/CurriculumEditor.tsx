'use client';

import { AlertTriangle, BookOpen, CheckCircle2, Hexagon, Loader2 } from 'lucide-react';
import { useChapterMutations } from '@/hooks/mutations/useChapterMutations';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCourse } from '@components/Contexts/CourseContext';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import type { CourseOrderPayload } from '@/schemas/chapterSchemas';
import ChapterElement from './DraggableElements/ChapterElement';

const CurriculumEditor = () => {
  const t = useTranslations('CourseEdit.Structure');

  const course = useCourse();
  const course_structure = course.courseStructure;
  const { course_uuid } = course_structure;
  const { createChapter, reorderStructure } = useChapterMutations(course_uuid, true);

  // Inline chapter creation state
  const [showChapterInput, setShowChapterInput] = useState(false);
  const [newChapterName, setNewChapterName] = useState('');
  const [isCreatingChapter, setIsCreatingChapter] = useState(false);
  const newChapterInputRef = useRef<HTMLInputElement>(null);

  // Structure save status
  const [structureStatus, setStructureStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (structureStatus !== 'saved') return;
    const timer = setTimeout(() => setStructureStatus('idle'), 3000);
    return () => clearTimeout(timer);
  }, [structureStatus]);

  useEffect(() => {
    if (!showChapterInput) return;
    newChapterInputRef.current?.focus();
  }, [showChapterInput]);

  // --- Chapter creation ---
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
      await createChapter({ name, course_uuid: course.courseStructure.course_uuid });
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
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelNewChapter();
    }
  };

  // --- Drag-and-drop reorder ---
  const updateStructure = async (result: any) => {
    const { destination, source, type } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newCourseStructure = structuredClone(course_structure);

    if (type === 'chapter') {
      const newChapterOrder = [...newCourseStructure.chapters];
      const [movedChapter] = newChapterOrder.splice(source.index, 1);
      if (!movedChapter) return;
      newChapterOrder.splice(destination.index, 0, movedChapter);
      newCourseStructure.chapters = newChapterOrder;
    }

    if (type === 'activity') {
      const newChapterOrder = [...newCourseStructure.chapters];
      const sourceChapter = newChapterOrder.find((c: any) => c.chapter_uuid === source.droppableId);
      const destinationChapter =
        newChapterOrder.find((c: any) => c.chapter_uuid === destination.droppableId) ?? sourceChapter;

      if (!(sourceChapter && destinationChapter)) return;
      if (!(sourceChapter.activities && destinationChapter.activities)) return;

      const [movedActivity] = sourceChapter.activities.splice(source.index, 1);
      if (!movedActivity) return;
      destinationChapter.activities.splice(destination.index, 0, movedActivity);
      newCourseStructure.chapters = newChapterOrder;
    }

    const payload: CourseOrderPayload = {
      chapter_order_by_uuids: newCourseStructure.chapters.map((chapter: any) => ({
        chapter_uuid: chapter.chapter_uuid,
        activities_order_by_uuids: (chapter.activities || []).map((activity: any) => activity.activity_uuid),
      })),
    };

    try {
      setStructureStatus('saving');
      await reorderStructure(newCourseStructure, payload);
      setStructureStatus('saved');
    } catch (error: any) {
      setStructureStatus('error');
      toast.error(error?.message || t('saveOrderError'));
    }
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
        <DragDropContext onDragEnd={updateStructure}>
          <Droppable
            type="chapter"
            droppableId="chapters"
            direction="vertical"
          >
            {(provided, snapshot) => (
              <div
                className={cn('space-y-4', snapshot.isDraggingOver && 'bg-muted/40 rounded-xl')}
                {...provided.droppableProps}
                ref={provided.innerRef}
              >
                {course_structure.chapters.map((chapter: any, index: any) => (
                  <ChapterElement
                    key={chapter.chapter_uuid}
                    chapterIndex={index}
                    course_uuid={course_uuid}
                    chapter={chapter}
                  />
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Inline chapter creation */}
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
