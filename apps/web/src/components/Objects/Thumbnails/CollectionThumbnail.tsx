'use client'

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
} from '@/components/ui/alert-dialog'
import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import { deleteCollection } from '@/lib/api/generated/collections/collections'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Crown, Layers, Loader2, Trash2 } from 'lucide-react'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { revalidateTags } from '@/lib/cache/revalidate'
import { getAbsoluteUrl } from '@services/config/config'
import { useApiError } from '@/hooks/useApiError'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { useTranslations } from 'next-intl'
import Link from '@components/ui/AppLink'
import { useState } from 'react'
import { toast } from 'sonner'

interface PropsType {
  collection: AppCollection
}

const removeCollectionPrefix = (collectionid: string) => collectionid.replace('collection_', '')

function CollectionMosaic({ courses }: { courses: AppCourse[] | number[] | undefined }) {
  if (!courses || courses.length === 0) {
    return (
      <div className="bg-muted flex h-full w-full items-center justify-center">
        <Layers className="text-muted-foreground/50 h-8 w-8" />
      </div>
    )
  }

  const courseList = courses.filter((c): c is AppCourse => typeof c === 'object' && c !== null)
  const courseImages = courseList
    .filter((c): c is typeof c & { thumbnail_image: string } => typeof c.thumbnail_image === 'string')
    .map(c => getCourseThumbnailMediaDirectory(c.course_uuid, c.thumbnail_image))

  if (courseImages.length === 0) {
    return (
      <div className="bg-muted flex h-full w-full items-center justify-center">
        <Layers className="text-muted-foreground/50 h-8 w-8" />
      </div>
    )
  }

  if (courseImages.length === 1) {
    return <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${courseImages[0]})` }} />
  }

  if (courseImages.length === 2) {
    return (
      <div className="flex h-full w-full">
        <div
          className="border-background h-full w-1/2 border-r bg-cover bg-center"
          style={{ backgroundImage: `url(${courseImages[0]})` }}
        />
        <div className="h-full w-1/2 bg-cover bg-center" style={{ backgroundImage: `url(${courseImages[1]})` }} />
      </div>
    )
  }

  if (courseImages.length === 3) {
    return (
      <div className="flex h-full w-full">
        <div
          className="border-background h-full w-1/2 border-r bg-cover bg-center"
          style={{ backgroundImage: `url(${courseImages[0]})` }}
        />
        <div className="flex h-full w-1/2 flex-col">
          <div
            className="border-background h-1/2 w-full border-b bg-cover bg-center"
            style={{ backgroundImage: `url(${courseImages[1]})` }}
          />
          <div className="h-1/2 w-full bg-cover bg-center" style={{ backgroundImage: `url(${courseImages[2]})` }} />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background grid h-full w-full grid-cols-2 grid-rows-2 gap-[1px]">
      <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${courseImages[0]})` }} />
      <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${courseImages[1]})` }} />
      <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${courseImages[2]})` }} />
      <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${courseImages[3]})` }} />
    </div>
  )
}

function CollectionThumbnail({ collection }: PropsType) {
  const t = useTranslations('Components.CollectionThumbnail')
  const tCommon = useTranslations('Common')

  const isOwner = collection.is_owner ?? false
  const canDelete = collection.can_delete === true

  return (
    <div className="group border-border bg-card hover:border-primary/20 relative flex h-full flex-col overflow-hidden rounded-xl border shadow-sm transition-all hover:shadow-md">
      <Link
        href={getAbsoluteUrl(`/collection/${removeCollectionPrefix(collection.collection_uuid ?? '')}`)}
        className="border-border/50 relative block aspect-[16/9] w-full overflow-hidden border-b"
        aria-label={collection.name ?? ''}
      >
        <CollectionMosaic courses={collection.courses} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>

      {/* UX-119: a learner can never delete — no disabled icon to hover over. */}
      {canDelete && (
        <div className="absolute top-2 right-2 z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <CollectionDeleteAction collection_uuid={collection.collection_uuid ?? ''} collection={collection} />
        </div>
      )}

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <Link
            href={getAbsoluteUrl(`/collection/${removeCollectionPrefix(collection.collection_uuid ?? '')}`)}
            className="text-foreground hover:text-primary line-clamp-2 text-base font-semibold transition-colors"
          >
            {collection.name}
          </Link>
        </div>

        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="text-muted-foreground flex items-center gap-1.5">
            <Layers className="h-4 w-4" />
            <p className="text-sm font-medium">{t('courseCount', { count: collection.courses?.length ?? 0 })}</p>
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
  )
}

function CollectionDeleteAction({
  collection_uuid,
  collection,
}: {
  collection_uuid: string
  collection: AppCollection
}) {
  const t = useTranslations('Components.CollectionThumbnail')
  const queryClient = useQueryClient()
  const { toastApiError } = useApiError()
  const [isOpen, setIsOpen] = useState(false)

  // UX-124: apiJson from the client (BUG-035) — the grid is a client query, so
  // drop it and the server seed; no router.refresh().
  const remove = useMutation({
    mutationFn: () => deleteCollection(collection_uuid),
    onSuccess: async () => {
      setIsOpen(false)
      await queryClient.invalidateQueries({ queryKey: queryKeys.collections.list() })
      toast.success(t('deleted', { collectionName: collection.name ?? '' }))
      await revalidateTags(['collections'])
    },
    onError: error => toastApiError(error, { fallback: t('deleteFailed') }),
  })
  const isPending = remove.isPending

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="secondary"
            size="icon"
            aria-label={t('deleteConfirmationTitle', { collectionName: collection.name ?? '' })}
            className="bg-background/90 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground h-8 w-8 shadow-sm backdrop-blur-sm"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        }
      />

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteConfirmationTitle', { collectionName: collection.name ?? '' })}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteConfirmationMessage')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} />
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm"
            onClick={() => remove.mutate()}
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
  )
}

export default CollectionThumbnail
