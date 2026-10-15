import { Maximize2 } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '#/shared/ui/dialog'

type ImageViewProps = { src: string; width: number | undefined; editable: boolean }

/** A lesson image; for the learner it opens full size in a dialog (B-EDT-30), as the old web's lightbox did. */
export function ImageView({ src, width, editable }: ImageViewProps) {
  const image = (
    <img src={src} alt={m.editor_image_alt()} width={width} loading="lazy" className="h-auto max-w-full rounded-lg" />
  )
  if (editable) return image
  return (
    <Dialog>
      <DialogTrigger
        aria-label={m.editor_image_expand()}
        className="group relative cursor-zoom-in rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {image}
        <Maximize2
          aria-hidden
          className="absolute top-2 right-2 size-6 rounded-md bg-background/80 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </DialogTrigger>
      <DialogContent className="max-h-dvh overflow-auto sm:max-w-5xl">
        <DialogTitle className="sr-only">{m.editor_image_alt()}</DialogTitle>
        <img src={src} alt={m.editor_image_alt()} className="h-auto w-full" />
      </DialogContent>
    </Dialog>
  )
}
