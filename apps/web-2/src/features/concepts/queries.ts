import type { QueryClient } from '@tanstack/react-query'

import {
  classMasteryOptions,
  conceptGraphOptions,
  conceptGraphQueryKey,
  createConceptMutation,
  createConceptTagMutation,
  deleteConceptMutation,
  deleteConceptTagMutation,
  getCurriculumOptions,
  learnerMasteryOptions,
  myMasteryOptions,
  reviewConceptsMutation,
  setPrerequisitesMutation,
  updateConceptMutation,
  updateConceptTagMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { suggestConcepts } from '#/shared/api/gen/sdk.gen'
import type { ConceptGraph, CourseId, SuggestConceptsRequest, UserId } from '#/shared/api/gen/types.gen'

const byCourse = (courseId: CourseId) => ({ path: { course_id: courseId } })

export const graphOptions = (courseId: CourseId) => conceptGraphOptions(byCourse(courseId))
export const graphKey = (courseId: CourseId) => conceptGraphQueryKey(byCourse(courseId))
/** The course's activities by name: tags name the activity they mark. */
export const curriculumOptions = (courseId: CourseId) => getCurriculumOptions(byCourse(courseId))
export const classOptions = (courseId: CourseId) => classMasteryOptions(byCourse(courseId))
export const learnerOptions = (courseId: CourseId, userId: UserId) =>
  learnerMasteryOptions({ path: { course_id: courseId, user_id: userId } })
export const myOptions = (courseId: CourseId) => myMasteryOptions(byCourse(courseId))

/** Loader of the `concepts` tab: the graph and the curriculum; the class map's failure (feature off) stays in its section. */
export const ensureConcepts = (queryClient: QueryClient, courseId: CourseId) =>
  Promise.all([
    queryClient.query({ ...graphOptions(courseId), staleTime: 'static' }),
    queryClient.query({ ...curriculumOptions(courseId), staleTime: 'static' }),
    queryClient.query({ ...classOptions(courseId), staleTime: 'static' }).catch(() => undefined),
  ])

/** `suggestConcepts` answers the queued run (202); `useAiRun` follows it to its end. */
export const suggestQueue = (courseId: CourseId) => (body: SuggestConceptsRequest) =>
  suggestConcepts({ ...byCourse(courseId), body, throwOnError: true }).then(({ data }) => data)

// Every write changes the graph: the tab reads it again. A review answers the new graph: it goes into the cache.
const graphChanged = (courseId: CourseId) => ({ meta: { invalidates: [graphKey(courseId)] } })

export const reviewOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...reviewConceptsMutation(),
  onSuccess: (graph: ConceptGraph) => queryClient.setQueryData(graphKey(courseId), graph),
})
export const createOptions = (courseId: CourseId) => ({ ...createConceptMutation(), ...graphChanged(courseId) })
export const updateOptions = (courseId: CourseId) => ({ ...updateConceptMutation(), ...graphChanged(courseId) })
export const deleteOptions = (courseId: CourseId) => ({ ...deleteConceptMutation(), ...graphChanged(courseId) })
export const prerequisitesOptions = (courseId: CourseId) => ({
  ...setPrerequisitesMutation(),
  ...graphChanged(courseId),
})
export const createTagOptions = (courseId: CourseId) => ({ ...createConceptTagMutation(), ...graphChanged(courseId) })
export const updateTagOptions = (courseId: CourseId) => ({ ...updateConceptTagMutation(), ...graphChanged(courseId) })
export const deleteTagOptions = (courseId: CourseId) => ({ ...deleteConceptTagMutation(), ...graphChanged(courseId) })
