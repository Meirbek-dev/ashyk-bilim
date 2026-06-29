import { useState, useCallback } from 'react'
import { createNewCourse, getCourseMetadata } from '@services/courses/courses'
import { createChapter } from '@services/courses/chapters'
import {
  cleanCourseUuid,
  buildCourseWorkspacePath,
  buildCourseOverviewPath,
  prefixedCourseUuid,
} from '@/lib/course-management'
import type { CourseCreatePayload, CourseCreateResult } from './course-create-types'

export function useCreateCourseMutation() {
  const [isPending, setIsPending] = useState(false)

  const mutate = useCallback(
    async (payload: CourseCreatePayload, destination: 'overview' | 'curriculum'): Promise<CourseCreateResult> => {
      setIsPending(true)
      try {
        // Map structureMode to API template param
        const apiTemplate =
          payload.structureMode === 'copy-outline'
            ? undefined // handled client-side
            : payload.structureMode === 'starter'
              ? 'starter'
              : 'blank'

        const result = await createNewCourse(
          {
            name: payload.title.trim(),
            description: payload.description.trim(),
            learnings: JSON.stringify([]),
            tags: JSON.stringify([]),
            visibility: payload.initialVisibility === 'public',
            template: apiTemplate,
          },
          null,
        )

        const created = result.data

        if (!result.success || !created || !('course_uuid' in (created as Record<string, unknown>))) {
          const detail =
            created && typeof created === 'object' && 'detail' in (created as Record<string, unknown>)
              ? (created as Record<string, unknown>).detail
              : undefined
          return {
            status: 'error',
            message: typeof detail === 'string' ? detail : 'Course creation failed.',
          }
        }

        const courseUuid = cleanCourseUuid((created as { course_uuid: string }).course_uuid)
        const destinationPath =
          destination === 'curriculum'
            ? buildCourseWorkspacePath(courseUuid, 'curriculum')
            : buildCourseOverviewPath(courseUuid)

        // For copy-outline: fetch source chapters and seed them
        if (payload.structureMode === 'copy-outline' && payload.sourceCourseUuid) {
          let sourceChapters: { name: string; description: string }[] = []
          try {
            const sourceMetadata = await getCourseMetadata(
              prefixedCourseUuid(payload.sourceCourseUuid),
              undefined,
              true,
            )
            sourceChapters = Array.isArray(sourceMetadata?.chapters)
              ? sourceMetadata.chapters.map((ch: { name: string; description: string | null }) => ({
                  name: ch.name,
                  description: ch.description ?? '',
                }))
              : []
          } catch {
            // source fetch failed — treat as partial success with 0 chapters
            return {
              status: 'partial',
              courseUuid,
              importedChapterCount: 0,
              failedChapterCount: 0,
              destinationPath,
            }
          }

          const results = await Promise.allSettled(
            sourceChapters.map(chapter =>
              createChapter({
                name: chapter.name || 'Imported chapter',
                description: chapter.description || '',
                thumbnail_image: '',
                course_uuid: (created as { course_uuid: string }).course_uuid,
              }),
            ),
          )

          const succeeded = results.filter(r => r.status === 'fulfilled').length
          const failed = results.filter(r => r.status === 'rejected').length

          if (failed > 0) {
            return {
              status: 'partial',
              courseUuid,
              importedChapterCount: succeeded,
              failedChapterCount: failed,
              destinationPath,
            }
          }

          return {
            status: 'success',
            courseUuid,
            importedChapterCount: succeeded,
            destinationPath,
          }
        }

        return {
          status: 'success',
          courseUuid,
          importedChapterCount: 0,
          destinationPath,
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unable to create course.'
        return { status: 'error', message }
      } finally {
        setIsPending(false)
      }
    },
    [],
  )

  return { mutate, isPending }
}
