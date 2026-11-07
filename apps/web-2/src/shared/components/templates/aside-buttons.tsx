import { PanelRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '#/shared/ui/button'

import { IconButton } from '../icon-button'
import { SheetPanel } from '../sheet-panel'

type AsideButtonsProps = {
  aside: { label: string; content: ReactNode }
  open: boolean
  onOpen: (open: boolean) => void
}

/**
 * The bar's way to the right panel. Wide: a named toggle for the panel beside the page (closed until wanted, then
 * remembered). Narrow: an icon that slides the panel in as a sheet.
 */
export function AsideButtons({ aside, open, onOpen }: AsideButtonsProps) {
  return (
    <>
      <Button
        variant={open ? 'secondary' : 'outline'}
        className="hidden @5xl:inline-flex"
        aria-expanded={open}
        aria-controls={open ? 'focus-aside' : undefined}
        onClick={() => onOpen(!open)}
      >
        <PanelRight aria-hidden data-icon="inline-start" />
        {aside.label}
      </Button>
      <div className="@5xl:hidden">
        <SheetPanel
          side="right"
          title={aside.label}
          trigger={<IconButton label={aside.label} icon={<PanelRight aria-hidden />} />}
        >
          {aside.content}
        </SheetPanel>
      </div>
    </>
  )
}
