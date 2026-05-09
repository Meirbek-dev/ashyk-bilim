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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { createCourseUpdate, deleteCourseUpdate } from '@services/courses/updates';
import { AlertTriangle, Loader2, PencilLine, Rss, TentTree } from 'lucide-react';
import { Field, FieldContent, FieldError, FieldLabel } from '@components/ui/field';
import { getUserAvatarMediaDirectory } from '@services/media/media';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { Actions, Resources, Scopes } from '@/types/permissions';
import { useCourseUpdates } from '@/features/courses/hooks/useCourseQueries';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { useDateFnsLocale } from '@/hooks/useDateFnsLocale';
import { useQueryClient } from '@tanstack/react-query';
import UserAvatar from '@components/Objects/UserAvatar';
import { useSession } from '@/hooks/useSession';
import { format, formatDistanceToNow } from 'date-fns';
import { Controller, useForm } from 'react-hook-form';
import { Textarea } from '@components/ui/textarea';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useTransition } from 'react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import * as v from 'valibot';

const getCourseUpdatesQueryKey = (courseUuid?: string | null) =>
  courseUuid ? queryKeys.courses.updates(courseUuid) : (['courses', 'updates', 'disabled'] as const);

interface Author {
  user: {
    id: number;
    user_uuid: string;
    avatar_image: string;
    first_name: string;
    middle_name?: string;
    last_name: string;
    username: string;
  };
  authorship: 'CREATOR' | 'CONTRIBUTOR' | 'MAINTAINER' | 'REPORTER';
  authorship_status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
}

interface CourseAuthorsProps {
  authors: Author[];
  courseUuid: string;
}

const MultipleAuthors = ({ authors, isMobile }: { authors: Author[]; isMobile: boolean }) => {
  const t = useTranslations('Courses.CourseAuthors');
  const displayedAvatars = authors.slice(0, 3);
  const displayedNames = authors.slice(0, 2);
  const remainingCount = Math.max(0, authors.length - 3);

  // Consistent sizes for both avatars and badge
  const avatarSize = isMobile ? 72 : 86;

  return (
    <div className="flex flex-col items-center space-y-4 px-2 pb-2">
      <div className="self-start text-[12px] font-semibold text-neutral-400">{t('authorsAndUpdates')}</div>

      {/* Avatars row */}
      <div className="relative flex justify-center -space-x-6">
        {displayedAvatars.map((author, index) => (
          <div
            key={author.user.user_uuid}
            className="relative"
            style={{ zIndex: displayedAvatars.length - index }}
          >
            <div className="ring-white">
              <UserAvatar
                size={isMobile ? 'xl' : '2xl'}
                variant="outline"
                avatar_url={
                  author.user.avatar_image && author.user.user_uuid
                    ? getUserAvatarMediaDirectory(author.user.user_uuid, author.user.avatar_image)
                    : ''
                }
                predefined_avatar={author.user.avatar_image ? undefined : 'empty'}
                showProfilePopup
                userId={author.user.id}
              />
            </div>
          </div>
        ))}
        {remainingCount > 0 && (
          <div className="relative z-0">
            <div
              className="flex items-center justify-center rounded-full border-4 border-white bg-neutral-100 font-medium text-neutral-600 shadow-sm"
              style={{
                width: `${avatarSize}px`,
                height: `${avatarSize}px`,
                fontSize: isMobile ? '14px' : '16px',
              }}
            >
              +{remainingCount}
            </div>
          </div>
        )}
      </div>

      {/* Names row - improved display logic */}
      <div className="mt-2 text-center">
        <div className="text-sm font-medium text-neutral-800">
          {authors.length === 1 ? (
            <span>
              {authors[0]?.user?.first_name && authors[0]?.user?.last_name
                ? [authors[0].user.first_name, authors[0].user.middle_name, authors[0].user.last_name]
                    .filter(Boolean)
                    .join(' ')
                : `@${authors[0]?.user?.username || 'Unknown'}`}
            </span>
          ) : (
            <>
              {displayedNames.map((author, index) => (
                <span key={author.user.user_uuid}>
                  {author.user.first_name && author.user.last_name
                    ? [author.user.first_name, author.user.middle_name, author.user.last_name].filter(Boolean).join(' ')
                    : `@${author.user.username}`}
                  {index === 0 && authors.length > 1 && index < displayedNames.length - 1 && t('and')}
                </span>
              ))}
              {authors.length > 2 && (
                <span className="ml-1 text-neutral-500">{t('andMoreAuthors', { count: authors.length - 2 })}</span>
              )}
            </>
          )}
        </div>
        <div className="mt-0.5 text-xs text-neutral-500">
          {authors.length === 1 ? (
            <span>@{authors[0]?.user?.username || 'Unknown'}</span>
          ) : (
            displayedNames.map((author, index) => (
              <span key={author.user.user_uuid}>
                @{author.user?.username || 'Unknown'}
                {index === 0 && authors.length > 1 && index < displayedNames.length - 1 && t('and')}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const UpdatesSection = ({ courseUuid }: { courseUuid: string }) => {
  const [selectedView, setSelectedView] = useState('list');
  const { can, isAuthenticated } = useSession();
  const canManageCourse =
    can(Resources.COURSE, Actions.MANAGE, Scopes.OWN) || can(Resources.COURSE, Actions.MANAGE, Scopes.PLATFORM);
  const { data: updates } = useCourseUpdates(courseUuid, { enabled: isAuthenticated });
  const t = useTranslations('Courses.CourseAuthors');

  return (
    <div className="mt-2 pt-2">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Rss
              size={14}
              className="text-neutral-400"
            />
            <span className="text-sm font-semibold text-neutral-600">{t('courseUpdates')}</span>
          </div>
          {updates && updates.length > 0 ? (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-nowrap text-neutral-500">
              {updates.length} {updates.length === 1 ? t('update') : t('updates')}
            </span>
          ) : null}
        </div>
        {canManageCourse ? (
          <button
            onClick={() => {
              setSelectedView(selectedView === 'new' ? 'list' : 'new');
            }}
            className={`ml-2 inline-flex items-center space-x-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
              selectedView === 'new'
                ? 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            } `}
          >
            <PencilLine size={12} />
            <span>{selectedView === 'new' ? t('cancel') : t('newUpdate')}</span>
          </button>
        ) : null}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="relative"
      >
        <div className="-mr-1 max-h-[300px] overflow-y-auto pr-1">
          {selectedView === 'list' ? (
            <UpdatesListView courseUuid={courseUuid} />
          ) : (
            <NewUpdateForm
              courseUuid={courseUuid}
              setSelectedView={setSelectedView}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
};

const createUpdateFormSchema = (t: (key: string) => string) =>
  v.object({
    title: v.pipe(v.string(), v.minLength(1, t('titleRequired'))),
    content: v.pipe(v.string(), v.minLength(1, t('contentRequired'))),
  });

type UpdateFormValues = v.InferOutput<ReturnType<typeof createUpdateFormSchema>>;
type UpdateFormInputValues = v.InferInput<ReturnType<typeof createUpdateFormSchema>>;

const NewUpdateForm = ({
  courseUuid,
  setSelectedView,
}: {
  courseUuid: string;
  setSelectedView: (view: string) => void;
}) => {
  const queryClient = useQueryClient();
  const t = useTranslations('Courses.CourseAuthors');
  const validationSchema = createUpdateFormSchema(t);

  const form = useForm<UpdateFormInputValues, any, UpdateFormValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      title: '',
      content: '',
    },
  });

  const onSubmit = async (values: UpdateFormValues) => {
    const body = {
      title: values.title,
      content: values.content,
      course_uuid: courseUuid,
    };
    const res = await createCourseUpdate(body);
    if (res.status === 200) {
      toast.success(t('updateAddedSuccess'));
      setSelectedView('list');
      form.reset();
      void queryClient.invalidateQueries({
        queryKey: getCourseUpdatesQueryKey(courseUuid),
      });
    } else {
      toast.error(t('updateAddFailed'));
    }
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <Controller
          control={form.control}
          name="title"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>{t('updateTitle')}</FieldLabel>
              <FieldContent>
                <Input
                  type="text"
                  id={field.name}
                  placeholder={t('updateTitlePlaceholder')}
                  className="border-neutral-200 bg-white focus:border-neutral-300 focus:ring-neutral-200"
                  {...field}
                />
              </FieldContent>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="content"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>{t('updateContent')}</FieldLabel>
              <FieldContent>
                <Textarea
                  placeholder={t('updateContentPlaceholder')}
                  id={field.name}
                  className="h-[120px] resize-none border-neutral-200 bg-white focus:border-neutral-300 focus:ring-neutral-200"
                  {...field}
                />
              </FieldContent>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <div className="flex justify-end space-x-2 pt-2">
          <Button
            type="submit"
            className="rounded-full px-4 py-1.5 text-xs font-medium text-white transition-colors duration-150"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? t('publishing') : t('publishUpdate')}
          </Button>
        </div>
      </form>
    </div>
  );
};

const UpdatesListView = ({ courseUuid }: { courseUuid: string }) => {
  const { can, isAuthenticated } = useSession();
  const canManageCourse =
    can(Resources.COURSE, Actions.MANAGE, Scopes.OWN) || can(Resources.COURSE, Actions.MANAGE, Scopes.PLATFORM);
  const { data: updates } = useCourseUpdates(courseUuid, { enabled: isAuthenticated });
  const t = useTranslations('Courses.CourseAuthors');
  const locale = useDateFnsLocale();

  if (!updates || updates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-8 text-center">
        <TentTree
          size={28}
          className="mb-2 text-neutral-400"
        />
        <p className="text-sm font-medium text-neutral-600">{t('noUpdatesYet')}</p>
        <p className="mt-1 text-xs text-neutral-400">{t('updatesAppearHere')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {updates.map((update: any) => (
        <motion.div
          key={update.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="group rounded-lg bg-neutral-50/50 p-3 transition-colors duration-150 hover:bg-neutral-100/80"
        >
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-baseline space-x-2">
                <h4 className="truncate text-sm font-medium text-neutral-800">{update.title}</h4>
                <span
                  title={format(new Date(update.creation_date), 'MMMM d, yyyy', { locale })}
                  className="text-[11px] font-medium whitespace-nowrap text-neutral-400"
                >
                  {formatDistanceToNow(new Date(update.creation_date), { addSuffix: true, locale })}
                </span>
              </div>
              <p className="line-clamp-3 text-sm text-neutral-600">{update.content}</p>
            </div>
            {canManageCourse ? (
              <div className="ml-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <DeleteUpdateButton
                  courseUuid={courseUuid}
                  update={update}
                />
              </div>
            ) : null}
          </div>
        </motion.div>
      ))}
    </div>
  );
};

const DeleteUpdateButton = ({ courseUuid, update }: { courseUuid: string; update: any }) => {
  const queryClient = useQueryClient();
  const t = useTranslations('Courses.CourseAuthors');
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const toast_loading = toast.loading(t('deletingUpdate'));
      const res = await deleteCourseUpdate(courseUuid, update.courseupdate_uuid);

      if (res.status === 200) {
        toast.dismiss(toast_loading);
        toast.success(t('updateDeletedSuccess'));
        void queryClient.invalidateQueries({
          queryKey: getCourseUpdatesQueryKey(courseUuid),
        });
        setIsOpen(false);
      } else {
        toast.dismiss(toast_loading);
        toast.error(t('updateDeleteFailed'));
      }
    });
  }

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <AlertDialogTrigger
        render={
          <button
            id="delete-update-button"
            className="rounded-full p-1.5 text-neutral-400 transition-all duration-150 hover:bg-rose-50 hover:text-rose-500"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400">
            <AlertTriangle className="size-8" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t('deleteUpdateTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteUpdateConfirmation')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? (
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                {t('deleting')}
              </div>
            ) : (
              t('deleteUpdate')
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const CourseAuthors = ({ authors, courseUuid }: CourseAuthorsProps) => {
  const isMobile = useIsMobile();

  // Filter active authors and sort by role priority
  const sortedAuthors = [...authors]
    .filter((author) => author.authorship_status === 'ACTIVE')
    .toSorted((a, b) => {
      const rolePriority: Record<string, number> = {
        CREATOR: 0,
        MAINTAINER: 1,
        CONTRIBUTOR: 2,
        REPORTER: 3,
      };
      const aPriority = rolePriority[a.authorship] ?? 999;
      const bPriority = rolePriority[b.authorship] ?? 999;
      return aPriority - bPriority;
    });

  return (
    <div className="antialiased">
      <MultipleAuthors
        authors={sortedAuthors}
        isMobile={isMobile}
      />
      <UpdatesSection courseUuid={courseUuid} />
    </div>
  );
};

export default CourseAuthors;
