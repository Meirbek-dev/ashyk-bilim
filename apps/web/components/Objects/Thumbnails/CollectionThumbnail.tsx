'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PermissionTooltip } from '@/components/Utils/PermissionTooltip';
import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { deleteCollection } from '@services/courses/collections';
import { Crown, Loader2, Trash2 } from 'lucide-react';
import { revalidateTags } from '@/lib/api-client';
import { getAbsoluteUrl } from '@services/config/config';
import { useState, useTransition } from 'react';
import { Badge } from '@components/ui/badge';
import { Button } from '@components/ui/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import { cn } from '@/lib/utils';

interface PropsType {
  collection: any;
}

const removeCollectionPrefix = (collectionid: string) => collectionid.replace('collection_', '');

const CollectionThumbnail = ({ collection }: PropsType) => {
  const t = useTranslations('Components.CollectionThumbnail');
  const tCommon = useTranslations('Common');

  const isOwner = collection.is_owner ?? false;
  const canDelete = collection.can_delete ?? false;

  return (
    <div className="group border-border bg-card hover:bg-accent/50 relative flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors">
      {/* Stacked course thumbnails */}
      <div className="flex shrink-0 -space-x-2">
        {collection.courses.slice(0, 3).map((course: any, index: number) =>
          course.thumbnail_image ? (
            <div
              key={course.course_uuid}
              className="border-background h-9 w-9 overflow-hidden rounded-md border-2 shadow-sm"
              style={{
                backgroundImage: `url(${getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                zIndex: 3 - index,
              }}
            />
          ) : (
            <div
              key={course.course_uuid}
              className="border-background bg-muted h-9 w-9 rounded-md border-2"
              style={{ zIndex: 3 - index }}
            />
          ),
        )}
        {collection.courses.length === 0 && (
          <div className="border-border bg-muted h-9 w-9 rounded-md border border-dashed" />
        )}
      </div>

      {/* Text content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            prefetch={false}
            href={getAbsoluteUrl(`/collection/${removeCollectionPrefix(collection.collection_uuid)}`)}
            className="text-foreground truncate text-sm font-medium hover:underline"
          >
            {collection.name}
          </Link>
          {isOwner && (
            <Badge
              variant="secondary"
              className="shrink-0 gap-1 text-xs"
            >
              <Crown className="h-3 w-3" />
              {tCommon('owner')}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs">{t('courseCount', { count: collection.courses.length })}</p>
      </div>

      {/* Delete action — visible on hover */}
      <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
        <CollectionDeleteAction
          collection_uuid={collection.collection_uuid}
          collection={collection}
          canDelete={canDelete}
        />
      </div>
    </div>
  );
};

const CollectionDeleteAction = ({
  collection_uuid,
  collection,
  canDelete,
}: {
  collection_uuid: string;
  collection: any;
  canDelete: boolean;
}) => {
  const t = useTranslations('Components.CollectionThumbnail');
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleDelete() {
    startTransition(async () => {
      await deleteCollection(collection_uuid);
      await revalidateTags(['collections']);
      setIsOpen(false);
      router.refresh();
    });
  }

  return (
    <PermissionTooltip
      enabled={canDelete}
      action="delete"
    >
      <AlertDialog
        open={isOpen}
        onOpenChange={setIsOpen}
      >
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              disabled={!canDelete}
              className={cn(
                'h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
                !canDelete && 'cursor-not-allowed opacity-40',
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          }
        />

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirmationTitle', { collectionName: collection.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteConfirmationMessage')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending} />
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  {t('deleting')}
                </>
              ) : (
                t('deleteButtonText')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PermissionTooltip>
  );
};

export default CollectionThumbnail;
