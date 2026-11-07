import { cn } from 'cn'
import { useState } from 'react'

type CourseCoverProps = {
  /** A storage key (`thumbnail_key`): the uploaded picture, else the plain field. */
  imageKey?: string | null
  /** Size and overrides; 16:9 at full width by default, the proportion uploads are made in. */
  className?: string
}

/**
 * A course's picture: the upload, whole, as its author made it (uploads carry their own lettering), or a quiet field
 * with the platform's emblem. It never prints the title: the caller sets that on the page, once. A picture that fails
 * to load gives way to the field, not an empty grey box. Decorative.
 */
export function CourseCover({ imageKey, className = '' }: CourseCoverProps) {
  const [broken, setBroken] = useState<string | null>(null)
  const image = imageKey && broken !== imageKey ? imageKey : null
  return (
    <div
      className={cn(
        'ab-dye ab-cover relative isolate aspect-video w-full overflow-hidden',
        // A hairline over the picture: many uploads have a white ground that would melt into the paper.
        image &&
          'after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-foreground/10',
        className,
      )}
    >
      {image ? (
        <img
          src={`/content/${image}`}
          alt=""
          loading="lazy"
          onError={() => setBroken(image)}
          // An image of the server's HTML may fail before hydration, when no onError is listening yet.
          ref={element => {
            if (element?.complete && element.naturalWidth === 0) setBroken(image)
          }}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span aria-hidden className="ab-mark ab-mark-emblem ab-cover-emblem" />
      )}
    </div>
  )
}
