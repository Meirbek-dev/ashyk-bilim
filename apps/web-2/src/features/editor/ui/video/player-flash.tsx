import { Gauge, RotateCcw, RotateCw, Volume2, VolumeX, type LucideIcon } from 'lucide-react'

import type { Flash } from './apply-command'

const ICONS: Record<Flash['icon'], LucideIcon> = {
  back: RotateCcw,
  forward: RotateCw,
  volume: Volume2,
  muted: VolumeX,
  rate: Gauge,
}

/** What a key or skip just changed («+10 с», «Громкость 70 %», «1,5×»), for a moment at the top of the picture. */
export function PlayerFlash({ flash }: { flash: Flash | null }) {
  const Icon = flash ? ICONS[flash.icon] : null
  return (
    <output className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 @md:top-4">
      {flash && Icon ? (
        <span className="flex items-center gap-2 rounded-full bg-media/70 px-3 py-1.5 text-sm font-medium whitespace-nowrap tabular-nums">
          <Icon aria-hidden className="size-4" />
          {flash.text}
        </span>
      ) : null}
    </output>
  )
}
