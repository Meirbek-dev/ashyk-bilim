import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import type { Curriculum } from '#/shared/api/gen/types.gen'

import { programSummary } from '../model/curriculum'

/** Above the chapters: how big the program is (drafts only when there are some), and «Новая глава». */
export function ProgramHeader({ curriculum, create }: { curriculum: Curriculum; create: ReactNode }) {
  const { chapters, activities, drafts } = programSummary(curriculum)
  const line = [
    m.studio_content_chapters({ count: chapters }),
    m.studio_list_activities({ count: activities }),
    ...(drafts > 0 ? [m.studio_content_drafts({ count: drafts })] : []),
  ].join(' · ')
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground tabular-nums">{line}</p>
      {create}
    </div>
  )
}
