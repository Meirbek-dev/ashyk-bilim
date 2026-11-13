import { ImageOff } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { MediaRef } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'

import { PictureZoom } from './picture-zoom'

// Automatic retries before the picture shows «не загрузилось» with a button: the redirect's short-lived URL may have
// expired under a cached 303, or the network dropped; a new query string asks the API for a fresh redirect.
const AUTO_RETRIES = 2

type ItemPictureProps = {
  picture: MediaRef
  /** Its URL (the API's redirect to a short-lived private one). */
  url: string
  /**
   * A click opens it full size (code on a screenshot is unreadable at column width). Off where the picture sits inside
   * a `<label>` (a choice option): a button there would be a second control of that label.
   */
  zoom: boolean
}

/** One picture of a question or an option: the recorded size reserves its space; it retries, then says it failed. */
export function ItemPicture({ picture, url, zoom }: ItemPictureProps) {
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const alt = picture.alt ?? ''
  const src = attempt === 0 ? url : `${url}?retry=${attempt}`
  if (failed)
    return (
      <div className="flex max-w-full flex-wrap items-center gap-3 rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
        <ImageOff aria-hidden className="size-4 shrink-0" />
        {/* No role=img around it: that would hide the button from a screen reader. The name is read as text. */}
        <span>
          {alt ? <span className="sr-only">{alt}: </span> : null}
          {m.ui_picture_failed()}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setFailed(false)
            setAttempt(attempt + 1)
          }}
        >
          {m.ui_retry()}
        </Button>
      </div>
    )
  const image = (
    <img
      src={src}
      alt={alt}
      width={picture.width}
      height={picture.height}
      loading="lazy"
      decoding="async"
      onError={() => (attempt < AUTO_RETRIES ? setAttempt(attempt + 1) : setFailed(true))}
      className="h-auto max-w-full rounded-md border"
    />
  )
  if (!zoom) return image
  return (
    <PictureZoom src={src} alt={alt} width={picture.width} height={picture.height}>
      {image}
    </PictureZoom>
  )
}
