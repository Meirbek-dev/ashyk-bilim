import { m } from '#/paraglide/messages'
import type { MediaRef } from '#/shared/api/gen/types.gen'

import { Picture } from './media-picture'
import { PickImage } from './pick-image'

/** The server's cap on the pictures under one prompt (`media`, max 5). */
const MAX_PROMPT_MEDIA = 5

type MediaListProps = {
  media: MediaRef[] | undefined
  onChange: (media: MediaRef[]) => void
  editable: boolean
}

/** The pictures under a prompt (up to five), in order: add, replace, remove, describe. */
export function MediaList({ media = [], onChange, editable }: MediaListProps) {
  if (media.length === 0 && !editable) return null
  return (
    <div className="flex flex-col gap-2">
      {media.map((picture, at) => (
        <Picture
          key={picture.upload_id}
          picture={picture}
          name={m.assessments_media_name({ number: at + 1 })}
          editable={editable}
          onChange={next =>
            onChange(
              next === null
                ? media.filter((_, index) => index !== at)
                : media.map((old, index) => (index === at ? next : old)),
            )
          }
        />
      ))}
      {editable && media.length < MAX_PROMPT_MEDIA ? (
        <PickImage label={m.assessments_media_add()} onPicked={picture => onChange([...media, picture])} />
      ) : null}
    </div>
  )
}
