import type { MediaRef } from '#/shared/api/gen/types.gen'
import { cn } from 'cn'

import { ItemPicture } from './item-picture'

/** A question picture of a test: the API redirects to a short-lived private URL (who may read the question may see it). */
export const assessmentMediaUrl = (assessmentId: string, uploadId: string) =>
  `/api/v2/assessments/${assessmentId}/media/${uploadId}`

/** A picture of a spreadsheet import's preview (its author and the course's authors). */
export const importMediaUrl = (importId: string, uploadId: string) =>
  `/api/v2/assessment-imports/${importId}/media/${uploadId}`

type ItemMediaProps = {
  media: MediaRef[] | undefined
  /** The URL of one picture (`assessmentMediaUrl` / `importMediaUrl` bound to the test or the import). */
  src: (uploadId: string) => string
  /** A click opens a picture full size (default); off inside a `<label>` (`ItemPicture`). */
  zoom?: boolean
  className?: string
}

/**
 * The pictures of a question or an option (`MediaRef`), in order. The recorded size reserves the space before the
 * picture loads; a picture never grows past its natural size or the column, and opens full size on a click.
 */
export function ItemMedia({ media, src, zoom = true, className }: ItemMediaProps) {
  if (!media?.length) return null
  return (
    <div className={cn('flex flex-col items-start gap-2', className)}>
      {media.map(picture => (
        <ItemPicture key={picture.upload_id} picture={picture} url={src(picture.upload_id)} zoom={zoom} />
      ))}
    </div>
  )
}
