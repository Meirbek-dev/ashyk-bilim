import { DragDropProvider, type DragEndEvent, type DragOverEvent } from '@dnd-kit/react'
import { move } from '@dnd-kit/helpers'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import { Alert } from '#/shared/ui/alert'
import { presentError } from '#/shared/i18n/errors'

import { curriculumOptions, moveActivityOptions, moveChapterOptions, placeCurriculum } from '../curriculum-queries'
import { applyLayout, layoutMove, layoutOf, type Layout } from '../model/curriculum'
import { can } from '../model/course'
import { courseOptions } from '../queries'
import { ChapterSection } from './chapter-section'
import { CreateChapterDialog } from './create-chapter-dialog'

/**
 * `content`: chapters and their activities in order. Dragging (pointer or keyboard on a handle) rearranges a
 * temporary layout; on drop the one move it amounts to goes into the cache and to the server, and a refusal puts
 * the server order back.
 */
export function ContentPage() {
  const { courseId } = useParams({ from: '/_authed/teach/courses/$courseId/content' })
  const queryClient = useQueryClient()
  const { data: curriculum } = useSuspenseQuery(curriculumOptions(courseId))
  const { data: course } = useSuspenseQuery(courseOptions(courseId))
  // The layout being dragged: a ref for the handlers (a fast keyboard drop can come before a re-render), state for
  // the render.
  const layout = useRef<Layout | null>(null)
  const [dragged, setDragged] = useState<Layout | null>(null)
  const place = (next: Layout | null) => {
    layout.current = next
    setDragged(next)
  }
  const moveChapter = useMutation(moveChapterOptions())
  const moveActivity = useMutation(moveActivityOptions())
  const shown = dragged ? applyLayout(curriculum, dragged) : curriculum
  const failed = moveChapter.error ?? moveActivity.error

  // Activities follow the pointer across chapters while dragging; chapters are reordered on drop.
  const over = (event: DragOverEvent) => {
    const current = layout.current
    if (event.operation.source?.type !== 'activity' || !current) return
    place({ ...current, activities: move(current.activities, event) })
  }
  const drop = (event: DragEndEvent) => {
    const source = event.operation.source
    const before = layoutOf(curriculum)
    const current = layout.current
    const after =
      current && source?.type === 'chapter' ? { ...current, chapters: move(current.chapters, event) } : current
    place(null)
    if (event.canceled || !after || !source) return
    const step = layoutMove(before, after, String(source.id))
    if (!step) return
    placeCurriculum(queryClient, courseId, applyLayout(curriculum, after))
    const restore = { onError: () => placeCurriculum(queryClient, courseId, curriculum) }
    if (step.kind === 'chapter') {
      moveChapter.mutate({ path: { chapter_id: step.id }, body: { position: step.position } }, restore)
    } else {
      const body = { chapter_id: step.chapterId, position: step.position }
      moveActivity.mutate({ path: { activity_id: step.id }, body }, restore)
    }
  }

  const create = can(course, 'update') ? <CreateChapterDialog courseId={courseId} /> : null
  return (
    <section aria-label={m.studio_content_label()} className="flex flex-col gap-gutter">
      <div className="flex justify-end">{create}</div>
      {failed ? <Alert>{presentError(failed)}</Alert> : null}
      {shown.chapters.length === 0 ? (
        <p className="py-8 text-muted-foreground">{m.studio_content_empty()}</p>
      ) : (
        <DragDropProvider onDragStart={() => place(layoutOf(curriculum))} onDragOver={over} onDragEnd={drop}>
          <ol className="flex flex-col gap-gutter">
            {shown.chapters.map((chapter, index) => (
              <ChapterSection key={chapter.id} courseId={courseId} chapter={chapter} index={index} />
            ))}
          </ol>
        </DragDropProvider>
      )}
    </section>
  )
}
