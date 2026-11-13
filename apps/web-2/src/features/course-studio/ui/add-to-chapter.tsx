import { Link as RouterLink } from '@tanstack/react-router'
import { FileSpreadsheet } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { CurriculumChapter } from '#/shared/api/gen/types.gen'
import { buttonVariants } from '#/shared/components/button-variants'

import { CreateActivityDialog } from './create-activity-dialog'

/** The chapter's foot: a new activity, or a DOT test file as a quiz or an exam of this chapter in one step. */
export function AddToChapter({ courseId, chapter }: { courseId: string; chapter: CurriculumChapter }) {
  return (
    <div className="flex flex-wrap gap-2 pt-3">
      <CreateActivityDialog courseId={courseId} chapter={chapter} />
      <RouterLink
        to="/teach/courses/$courseId/import"
        params={{ courseId }}
        search={{ chapter: chapter.id }}
        aria-label={m.studio_activity_from_excel_in({ name: chapter.name })}
        className={buttonVariants({ variant: 'ghost' })}
      >
        <FileSpreadsheet aria-hidden data-icon="inline-start" />
        {m.studio_activity_from_excel()}
      </RouterLink>
    </div>
  )
}
