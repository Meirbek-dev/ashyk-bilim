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
} from '@/components/ui/alert-dialog';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, Check, GripVertical, Hexagon, Loader2, Pencil, Trash2, X as XIcon } from 'lucide-react';
import { useChapterMutations } from '@/hooks/mutations/useChapterMutations';
import ToolTip from '@/components/Objects/Elements/Tooltip/Tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import NewActivityButton from '@/components/Dashboard/Pages/Course/EditCourseStructure/Buttons/NewActivityButton';
import ActivityElement from './ActivityElement';

type ActivityType =
  | 'TYPE_VIDEO'
  | 'TYPE_DOCUMENT'
  | 'TYPE_ASSIGNMENT'
  | 'TYPE_DYNAMIC'
  | 'TYPE_EXAM'
  | 'TYPE_CODE_CHALLENGE';

interface Activity {
  id: string;
  activity_uuid: string;
  activity_type: ActivityType;
  name: string;
  published: boolean;
  can_update?: boolean;
  can_delete?: boolean;
  is_owner?: boolean;
  is_creator?: boolean;
  available_actions?: string[];
  [key: string]: any;
}

interface Chapter {
  id: number;
  chapter_uuid: string;
  name: string;
  activities?: Activity[];
}

interface ChapterElementProps {
  chapter: Chapter;
  chapterIndex: number;
  course_uuid: string;
}

interface SortableActivityElementProps {
  activity: Activity;
  activityIndex: number;
  course_uuid: string;
  chapterUuid: string;
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
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(isDragging && 'opacity-50')}
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
  );
};

const ChapterElement = ({ chapter, chapterIndex, course_uuid }: ChapterElementProps) => {
  const { deleteChapter, updateChapter } = useChapterMutations(course_uuid, true);
  const t = useTranslations('CourseEdit');

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(chapter?.name ?? '');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeletingChapter, setIsDeletingChapter] = useState(false);

  const activities = chapter.activities ?? [];

  const activityIds = useMemo(() => activities.map((activity) => activity.activity_uuid), []);

  const publishedCount = activities.filter((activity) => activity.published).length;
  const draftCount = activities.length - publishedCount;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chapter.chapter_uuid,
    data: {
      type: 'chapter',
      chapter,
    },
  });

  const { setNodeRef: setActivitiesDroppableRef, isOver: isActivitiesOver } = useDroppable({
    id: chapter.chapter_uuid,
    data: {
      type: 'chapter',
      chapterUuid: chapter.chapter_uuid,
    },
  });

  const handleStartEdit = () => {
    setEditedName(chapter.name);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedName(chapter.name);
  };

  const handleSaveEdit = async () => {
    const trimmedName = editedName.trim();

    if (!trimmedName || trimmedName === chapter.name) {
      handleCancelEdit();
      return;
    }

    setIsSavingEdit(true);

    try {
      await updateChapter(chapter.chapter_uuid, { name: trimmedName });
      setIsEditing(false);
    } catch (error: any) {
      toast.error(error?.message || t('chapterUpdateFailed'));
      setEditedName(chapter.name);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteChapter = async () => {
    setIsDeletingChapter(true);

    try {
      await deleteChapter(chapter.chapter_uuid);
      setIsDeleteDialogOpen(false);
    } catch (error: any) {
      toast.error(error?.message || t('chapterDeleteFailed'));
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeletingChapter(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleSaveEdit();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  if (!chapter?.chapter_uuid) {
    return null;
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        'mb-4 rounded-xl border bg-card shadow-sm transition-all duration-200',
        isDragging ? 'opacity-70 shadow-2xl ring-2 ring-ring/30' : 'hover:shadow-md',
      )}
    >
      <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-6">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex-shrink-0 cursor-grab rounded-md p-1 active:cursor-grabbing"
          aria-label={t('dragChapter')}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>

        <div className="bg-muted flex-shrink-0 rounded-lg p-2">
          <Hexagon
            className="text-muted-foreground h-4 w-4"
            strokeWidth={2.5}
          />
        </div>

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-1.5">
              <Input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('chapterNamePlaceholder')}
                className="h-8 text-sm"
                disabled={isSavingEdit}
              />

              <ToolTip
                content={t('save')}
                side="top"
              >
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 flex-shrink-0 p-0 text-emerald-600 hover:text-emerald-700"
                  onClick={() => void handleSaveEdit()}
                  disabled={isSavingEdit}
                >
                  {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
              </ToolTip>

              <ToolTip
                content={t('cancel')}
                side="top"
              >
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 flex-shrink-0 p-0"
                  onClick={handleCancelEdit}
                  disabled={isSavingEdit}
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </ToolTip>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-foreground truncate text-sm font-medium sm:text-base">{chapter.name}</span>
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                {activities.length}
              </span>

              <ToolTip
                content={t('edit')}
                side="top"
              >
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground h-7 w-7 flex-shrink-0 p-0"
                  onClick={handleStartEdit}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </ToolTip>
            </div>
          )}
        </div>

        {!isEditing && (
          <ToolTip
            content={t('deleteChapterButton')}
            side="top"
          >
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive h-8 w-8 flex-shrink-0 p-0"
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </ToolTip>
        )}

        <AlertDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-muted text-foreground">
                <AlertTriangle className="size-8" />
              </AlertDialogMedia>
              <AlertDialogTitle>{t('deleteChapterTitle', { name: chapter.name })}</AlertDialogTitle>
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
              <AlertDialogAction
                variant="destructive"
                onClick={handleDeleteChapter}
                disabled={isDeletingChapter}
              >
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

      <SortableContext
        items={activityIds}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setActivitiesDroppableRef}
          className={cn('min-h-[80px] rounded-lg px-4 py-3 transition-colors', isActivitiesOver && 'bg-muted/50')}
        >
          {activities.length > 0 ? (
            activities.map((activity, index) => (
              <SortableActivityElement
                key={activity.activity_uuid}
                course_uuid={course_uuid}
                chapterUuid={chapter.chapter_uuid}
                activityIndex={index}
                activity={activity}
              />
            ))
          ) : (
            <div className="flex min-h-[60px] flex-col items-center justify-center gap-1 py-4 text-center">
              <p className="text-muted-foreground text-sm font-medium">{t('noActivities')}</p>
              <p className="text-muted-foreground/70 text-xs">{t('noActivitiesHint')}</p>
            </div>
          )}
        </div>
      </SortableContext>

      <div className="px-4 pb-4">
        <NewActivityButton chapterId={chapter.id} />
      </div>
    </div>
  );
};

export default ChapterElement;
