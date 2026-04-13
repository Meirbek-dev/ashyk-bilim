'use client';

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
import { PermissionTooltip } from '@/components/Utils/PermissionTooltip';
import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { deleteCollection } from '@services/courses/collections';
import { AlertTriangle, Crown, Loader2, X } from 'lucide-react';
import { revalidateTags } from '@/lib/api-client';
import { getAbsoluteUrl } from '@services/config/config';
import { useState, useTransition } from 'react';
import { Badge } from '@components/ui/badge';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';

interface PropsType {
  collection: any;
}

const removeCollectionPrefix = (collectionid: string) => {
  return collectionid.replace('collection_', '');
};

const CollectionThumbnail = (props: PropsType) => {
  const t = useTranslations('Components.CollectionThumbnail');
  const tCommon = useTranslations('Common');

  // Use backend metadata for ownership and permissions
  const isOwner = props.collection.is_owner ?? false;
  const canDelete = props.collection.can_delete ?? false;

  return (
    <div className="group relative overflow-hidden rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl">
      <div className="bg-primary flex h-full w-full items-center justify-between p-4">
        {/* Owner badge - shown at top left */}
        {isOwner && (
          <Badge
            variant="default"
            className="absolute top-2 left-2 z-10 gap-1 backdrop-blur-sm"
          >
            <Crown className="h-3 w-3" />
            {tCommon('owner')}
          </Badge>
        )}

        <div className="flex items-center space-x-2">
          <div className="flex -space-x-3">
            {props.collection.courses.slice(0, 3).map(
              (course: any, index: number) =>
                course.thumbnail_image && (
                  <div
                    key={course.course_uuid}
                    className="relative h-12 w-12 overflow-hidden rounded-full border-2 border-white shadow-md transition-all duration-300 hover:z-10 hover:scale-110"
                    style={{
                      backgroundImage: `url(${getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      zIndex: 3 - index,
                    }}
                  />
                ),
            )}
          </div>
          <div className="flex flex-col">
            <Link
              prefetch={false}
              href={getAbsoluteUrl(`/collection/${removeCollectionPrefix(props.collection.collection_uuid)}`)}
              className="text-lg font-bold text-white hover:underline"
            >
              {props.collection.name}
            </Link>
            <span className="mt-1 text-sm font-medium text-indigo-200">
              {t('courseCount', { count: props.collection.courses.length })}
            </span>
          </div>
        </div>
        <CollectionAdminEditsArea
          collection_uuid={props.collection.collection_uuid}
          collection={props.collection}
          canDelete={canDelete}
        />
      </div>
    </div>
  );
};

const CollectionAdminEditsArea = (props: any) => {
  const t = useTranslations('Components.CollectionThumbnail');
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Use backend metadata for permissions (passed as props)
  const canDelete = props.canDelete ?? false;

  async function deleteCollectionUI() {
    startTransition(async () => {
      await deleteCollection(props.collection_uuid);
      await revalidateTags(['collections']);
      setIsOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="z-20 px-2">
      <PermissionTooltip
        enabled={canDelete}
        action="delete"
      >
        <AlertDialog
          open={isOpen}
          onOpenChange={setIsOpen}
        >
          <AlertDialogTrigger
            disabled={!canDelete}
            render={
              <button
                className="absolute top-2 right-2 rounded-full bg-red-500 p-1 text-white transition-colors duration-300 hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-red-500/50 disabled:opacity-50"
                disabled={!canDelete}
              >
                <X size={14} />
              </button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400">
                <AlertTriangle className="size-8" />
              </AlertDialogMedia>
              <AlertDialogTitle>
                {t('deleteConfirmationTitle', { collectionName: props.collection.name })}
              </AlertDialogTitle>
              <AlertDialogDescription>{t('deleteConfirmationMessage')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel />
              <AlertDialogAction
                variant="destructive"
                onClick={deleteCollectionUI}
                disabled={isPending}
              >
                {isPending ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    {t('deleting')}
                  </div>
                ) : (
                  t('deleteButtonText')
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PermissionTooltip>
    </div>
  );
};

export default CollectionThumbnail;
