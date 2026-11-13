import { ZoomIn } from 'lucide-react'
import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '#/shared/ui/dialog'

type PictureZoomProps = {
  /** The picture as shown in the column (the trigger). */
  children: ReactNode
  src: string
  alt: string
  width: number
  height: number
}

/** A picture that opens full size in a dialog on a click (code on a screenshot is unreadable at column width). */
export function PictureZoom({ children, src, alt, width, height }: PictureZoomProps) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            aria-label={m.ui_picture_zoom()}
            className="group relative h-auto max-w-full cursor-zoom-in p-0 whitespace-normal hover:bg-transparent"
          />
        }
      >
        {children}
        <ZoomIn
          aria-hidden
          className="absolute end-2 top-2 size-6 rounded-sm bg-background/80 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-auto sm:max-w-[min(calc(100vw-2rem),80rem)]">
        <DialogTitle className="sr-only">{alt || m.ui_picture_zoom()}</DialogTitle>
        <img src={src} alt={alt} width={width} height={height} className="h-auto max-w-full" />
      </DialogContent>
    </Dialog>
  )
}
