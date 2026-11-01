import { RotateCcw } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'

import { clock } from '../../model/file-blocks'
import { ON_STAGE } from './player-button'

/** «Продолжаем с 3:12» after the saved position was restored, with a way back to the start. */
export function ResumeNotice({ at, onRestart }: { at: number; onRestart: () => void }) {
  return (
    <output className="flex items-center gap-1 rounded-lg bg-media/70 py-1 pr-1 pl-3 text-sm">
      <span className="tabular-nums">{m.editor_video_resumed({ time: clock(at) })}</span>
      <Button variant="ghost" size="sm" className={ON_STAGE} onClick={onRestart}>
        <RotateCcw aria-hidden data-icon="inline-start" />
        {m.editor_video_restart()}
      </Button>
    </output>
  )
}
