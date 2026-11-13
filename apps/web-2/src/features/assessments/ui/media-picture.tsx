import { X } from 'lucide-react'
import { createContext, use } from 'react'

import { m } from '#/paraglide/messages'
import type { MediaRef } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { assessmentMediaUrl, ItemMedia } from '#/shared/components/item-media'
import { Input } from '#/shared/ui/input'

import { PickImage } from './pick-image'

/** The test whose pictures the editor shows (`assessmentMediaUrl`); set once by the question editor. */
export const AssessmentIdContext = createContext('')

/** A picture with its description; an empty one is left out, as the server stores it. */
function withAlt({ upload_id, width, height }: MediaRef, alt: string): MediaRef {
  return alt ? { upload_id, width, height, alt } : { upload_id, width, height }
}

type PictureProps = {
  picture: MediaRef
  /** «Изображение N»: names the alt field and the buttons. */
  name: string
  onChange: (picture: MediaRef | null) => void
  /** Describe, replace and remove (wording: an answered live test takes it). */
  editable: boolean
}

/** One picture: the image, its description (alt), replace and remove. */
export function Picture({ picture, name, onChange, editable }: PictureProps) {
  const assessmentId = use(AssessmentIdContext)
  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <ItemMedia media={[picture]} src={id => assessmentMediaUrl(assessmentId, id)} className="max-w-sm" />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={m.assessments_media_alt({ name })}
          placeholder={m.assessments_media_alt_placeholder()}
          className="min-w-48 flex-1"
          maxLength={500}
          value={picture.alt ?? ''}
          disabled={!editable}
          onChange={event => onChange(withAlt(picture, event.target.value))}
        />
        {editable ? (
          <>
            <PickImage compact label={m.assessments_media_replace({ name })} alt={picture.alt} onPicked={onChange} />
            <IconButton
              label={m.assessments_media_remove({ name })}
              icon={<X aria-hidden />}
              onClick={() => onChange(null)}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}
