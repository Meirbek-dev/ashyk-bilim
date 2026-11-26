import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { ErrorAlert } from '#/shared/components/error-alert'
import { presentError } from '#/shared/i18n/errors'
import { Sortable, Transfer } from '#/shared/ui/sortable'

import { curriculumOptions, moveActivityOptions, moveChapterOptions, placeCurriculum } from '../curriculum-queries'
import { applyLayout, layoutMove, layoutOf, type Layout } from '../model/curriculum'
import { can } from '../model/course'
import { courseOptions } from '../queries'
import { ChapterSection } from './chapter-section'
import { CreateChapterDialog } from './create-chapter-dialog'
import { EmptyProgram } from './empty-program'
import { ProgramHeader } from './program-header'

/**
 * `content`: chapters and their activities in order. A chapter moves among chapters, an activity within its chapter
 * and into others (an empty one too), by pointer or keyboard on a handle. While one moves the page shows the draft;
 * on drop the one move it amounts to goes into the cache and to the server, and a refusal puts the server order back.
 */
export function ContentPage() {
  const { courseId } = useParams({ from: '/_authed/teach/courses/$courseId/content' })
  const queryClient = useQueryClient()
  const { data: curriculum } = useSuspenseQuery(curriculumOptions(courseId))
  const { data: course } = useSuspenseQuery(courseOptions(courseId))
  const moveChapter = useMutation(moveChapterOptions(courseId))
  const moveActivity = useMutation(moveActivityOptions())
  const failed = moveChapter.error ?? moveActivity.error
  const layout = layoutOf(curriculum)

  const commit = (after: Layout, id: string) => {
    const step = layoutMove(layout, after, id)
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

  const names = new Map(
    curriculum.chapters.flatMap(chapter => [
      [chapter.id, chapter.name] as const,
      ...chapter.activities.map(activity => [activity.id, activity.name] as const),
    ]),
  )
  const name = (id: string) => names.get(id)

  const create = can(course, 'update') ? <CreateChapterDialog courseId={courseId} /> : null
  return (
    <section aria-label={m.studio_content_label()} className="@container flex flex-col gap-gutter">
      {curriculum.chapters.length > 0 ? (
        <ProgramHeader courseId={courseId} curriculum={curriculum} create={create} />
      ) : null}
      {failed ? <ErrorAlert>{presentError(failed)}</ErrorAlert> : null}
      {curriculum.chapters.length === 0 ? (
        <EmptyProgram create={create} />
      ) : (
        <Transfer
          value={layout.activities}
          onValueChange={(activities, { key }) => commit({ ...layout, activities }, key)}
          label={name}
          listLabel={name}
        >
          {activities => (
            <Sortable
              value={layout.chapters}
              onValueChange={(chapters, { key }) => commit({ ...layout, chapters }, key)}
              label={name}
            >
              {chapters => (
                <ol className="flex flex-col gap-10">
                  {applyLayout(curriculum, { chapters, activities }).chapters.map((chapter, index) => (
                    <ChapterSection key={chapter.id} courseId={courseId} chapter={chapter} index={index} />
                  ))}
                </ol>
              )}
            </Sortable>
          )}
        </Transfer>
      )}
    </section>
  )
}
