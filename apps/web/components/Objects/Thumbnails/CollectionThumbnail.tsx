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
import { Crown, Layers, Loader2, Trash2 } from 'lucide-react';
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

const CollectionMosaic = ({ courses }: { courses: any[] }) => {
  if (!courses || courses.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <Layers className="h-8 w-8 text-muted-foreground/50" />
      </div>
    );
  }

  const courseImages = courses
    .filter((c) => c.thumbnail_image)
    .map((c) => getCourseThumbnailMediaDirectory(c.course_uuid, c.thumbnail_image));

  if (courseImages.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <Layers className="h-8 w-8 text-muted-foreground/50" />
      </div>
    );
  }

  if (courseImages.length === 1) {
    return (
      <div 
        className="h-full w-full bg-cover bg-center" 
        style={{ backgroundImage: `url(${courseImages[0]})` }} 
      />
    );
  }

  if (courseImages.length === 2) {
    return (
      <div className="flex h-full w-full">
        <div className="h-full w-1/2 border-r border-background bg-cover bg-center" style={{ backgroundImage: `url(${courseImages[0]})` }} />
        <div className="h-full w-1/2 bg-cover bg-center" style={{ backgroundImage: `url(${courseImages[1]})` }} />
      </div>
    );
  }

  if (courseImages.length === 3) {
    return (
      <div className="flex h-full w-full">
        <div className="h-full w-1/2 border-r border-background bg-cover bg-center" style={{ backgroundImage: `url(${courseImages[0]})` }} />
        <div className="flex h-full w-1/2 flex-col">
          <div className="h-1/2 w-full border-b border-background bg-cover bg-center" style={{ backgroundImage: `url(${courseImages[1]})` }} />
          <div className="h-1/2 w-full bg-cover bg-center" style={{ backgroundImage: `url(${courseImages[2]})` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-[1px] bg-background">
      <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${courseImages[0]})` }} />
      <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${courseImages[1]})` }} />
      <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${courseImages[2]})` }} />
      <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${courseImages[3]})` }} />
    </div>
  );
};

const CollectionThumbnail = ({ collection }: PropsType) => {
  const t = useTranslations('Components.CollectionThumbnail');
  const tCommon = useTranslations('Common');

  const isOwner = collection.is_owner ?? false;
  const canDelete = collection.can_delete ?? false;

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:shadow-md hover:border-primary/20">
      <Link
        prefetch={false}
        href={getAbsoluteUrl(`/collection/${removeCollectionPrefix(collection.collection_uuid)}`)}
        className="relative block aspect-[16/9] w-full overflow-hidden border-b border-border/50"
      >
        <CollectionMosaic courses={collection.courses} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>

      <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <CollectionDeleteAction
          collection_uuid={collection.collection_uuid}
          collection={collection}
          canDelete={canDelete}
        />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <Link
            prefetch={false}
            href={getAbsoluteUrl(`/collection/${removeCollectionPrefix(collection.collection_uuid)}`)}
            className="line-clamp-2 text-base font-semibold text-foreground transition-colors hover:text-primary"
          >
            {collection.name}
          </Link>
        </div>
        
        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Layers className="h-4 w-4" />
            <p className="text-sm font-medium">{t('courseCount', { count: collection.courses.length })}</p>
          </div>
          {isOwner && (
            <Badge variant="secondary" className="gap-1 rounded-md px-2 py-0.5 text-xs font-medium">
              <Crown className="h-3 w-3" />
              {tCommon('owner')}
            </Badge>
          )}
        </div>
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
              variant="secondary"
              size="icon"
              disabled={!canDelete}
              className={cn(
                'h-8 w-8 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-destructive hover:text-destructive-foreground',
                !canDelete && 'cursor-not-allowed opacity-40',
              )}
            >
              <Trash2 className="h-4 w-4" />
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
              className="bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
