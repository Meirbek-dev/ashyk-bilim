import { CloudCheck, CloudOff, CloudUpload, type LucideIcon } from 'lucide-react'

import { m } from '#/paraglide/messages'

import type { SaveStatus } from '../model/attempt'

const looks = {
  saved: { icon: CloudCheck, label: m.attempt_saved },
  saving: { icon: CloudUpload, label: m.attempt_saving },
  offline: { icon: CloudOff, label: m.attempt_offline },
} satisfies Record<SaveStatus, { icon: LucideIcon; label: () => string }>

/** The attempt's one save indicator (B-ATT-09): exactly saved, saving or offline, announced politely. */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  const { icon: Icon, label } = looks[status]
  return (
    <output className="flex items-center gap-1 [&_svg]:size-4">
      <Icon aria-hidden />
      <span className="sr-only @3xl:not-sr-only">{label()}</span>
    </output>
  )
}
