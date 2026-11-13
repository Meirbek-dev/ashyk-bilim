import { m } from '#/paraglide/messages'
import type { MediaRef } from '#/shared/api/gen/types.gen'

import type { EditMode } from '../model/route'
import { Picture } from './media-picture'
import { PickImage } from './pick-image'

type OptionMediaProps = {
  media: MediaRef | undefined
  /** The option's number, from 1. */
  number: number
  /** `undefined`: the picture was removed. */
  onChange: (media: MediaRef | undefined) => void
  mode: EditMode
}

/**
 * An option's one picture, or the button that adds it, under the option's text. A picture is wording (the server's
 * answer key leaves it out): an answered live test takes it too.
 */
export function OptionMedia({ media, number, onChange, mode }: OptionMediaProps) {
  const editable = mode !== 'none'
  const name = m.assessments_media_option_name({ number })
  if (!media && !editable) return null
  return (
    <div className="ps-8">
      {media ? (
        <Picture picture={media} name={name} onChange={next => onChange(next ?? undefined)} editable={editable} />
      ) : (
        <PickImage compact label={m.assessments_media_add_to_option({ number })} onPicked={onChange} />
      )}
    </div>
  )
}
