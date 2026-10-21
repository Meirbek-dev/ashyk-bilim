import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import type { Curriculum } from '#/shared/api/gen/types.gen'

import { programSummary } from '../model/curriculum'
import { PublishLessons } from './publish-lessons'

/**
 * Above the chapters: how big the program is (drafts only when there are some), «Опубликовать уроки» while several
 * lessons are drafts (B-CST-51), and «Новая глава».
 */
export function ProgramHeader({
  courseId,
  curriculum,
  create,
}: {
  courseId: string
  curriculum: Curriculum
  create: ReactNode
}) {
  const { chapters, activities, drafts } = programSummary(curriculum)
  const line = [
    m.studio_content_chapters({ count: chapters }),
    m.studio_list_activities({ count: activities }),
    ...(drafts > 0 ? [m.studio_content_drafts({ count: drafts })] : []),
  ].join(' · ')
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground tabular-nums">{line}</p>
      <div className="flex flex-wrap items-start gap-2">
        <PublishLessons courseId={courseId} curriculum={curriculum} />
        {create}
      </div>
    </div>
  )
}
