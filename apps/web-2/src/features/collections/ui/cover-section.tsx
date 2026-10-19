import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { RefObject } from 'react'

import { m } from '#/paraglide/messages'
import type { Collection } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { FileInput } from '#/shared/components/file-input'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { contentUrl } from '#/shared/lib/content-url'
import { toast } from '#/shared/ui/toast'

import { updateCollectionOptions } from '../queries'

type CoverSectionProps = { collection: Collection; base: RefObject<number> }

/**
 * B-COL-17 The collection's cover: a picked image uploads (`collection-cover`) and becomes the cover at once, like a
 * course cover; «Убрать обложку» clears it. Each write moves the page's base version (`base`), so the form above
 * still saves without a false conflict.
 */
export function CoverSection({ collection, base }: CoverSectionProps) {
  const update = useMutation(updateCollectionOptions(useQueryClient(), collection.id))
  const save = (cover: string | null) =>
    update.mutateAsync(
      {
        path: { collection_id: collection.id },
        body: { cover_upload_id: cover },
        headers: { 'If-Match': base.current },
      },
      {
        onSuccess: saved => {
          base.current = saved.version
          toast.add({ title: cover ? m.collections_saved() : m.collections_cover_removed() })
        },
      },
    )
  return (
    <section aria-labelledby="collection-cover" className="flex max-w-prose flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="collection-cover" className="text-xl font-semibold">
          {m.collections_cover_title()}
        </h2>
        <p className="text-sm text-muted-foreground">{m.collections_cover_hint()}</p>
      </div>
      {collection.cover_key ? (
        <div className="flex flex-col items-start gap-2">
          <img
            src={contentUrl(collection.cover_key)}
            alt={m.collections_cover_title()}
            className="aspect-video w-full max-w-sm rounded-lg border object-cover"
          />
          <SubmitButton
            variant="outline"
            onClick={() => void save(null).catch(() => undefined)}
            pending={update.isPending}
          >
            {m.collections_cover_remove()}
          </SubmitButton>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{m.collections_cover_none()}</p>
      )}
      <FileInput
        label={m.collections_cover_field()}
        description={m.collections_cover_types()}
        purpose="collection-cover"
        onUploaded={upload => save(upload.id)}
      />
      {update.error ? <ErrorAlert>{presentError(update.error)}</ErrorAlert> : null}
    </section>
  )
}
