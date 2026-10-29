import { ImageOff } from 'lucide-react'

import { m } from '#/paraglide/messages'

/** Public storage keys are served anonymously at /content/<key>. */
const contentUrl = (key: string) => `/content/${key}`

type PlatformImagePreviewProps = {
  /** The stored image; none shows an empty frame of the same shape. */
  imageKey: string | null | undefined
  label: string
  /** The frame's size classes (the image's own shape). */
  shape: string
}

/** A platform image as it is now, or an empty frame that says there is none. */
export function PlatformImagePreview({ imageKey, label, shape }: PlatformImagePreviewProps) {
  return imageKey ? (
    <img
      src={contentUrl(imageKey)}
      alt={label}
      className={`${shape} shrink-0 rounded-lg border bg-muted object-contain`}
    />
  ) : (
    <span
      className={`${shape} grid shrink-0 place-items-center rounded-lg border border-dashed bg-muted text-muted-foreground`}
    >
      <ImageOff aria-hidden className="size-5" />
      <span className="sr-only">{m.admin_platform_no_image()}</span>
    </span>
  )
}
