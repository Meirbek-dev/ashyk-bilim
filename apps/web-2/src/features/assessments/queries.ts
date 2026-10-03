import type { QueryClient } from '@tanstack/react-query'

import {
  auditTrailOptions,
  auditTrailQueryKey,
  createItemMutation,
  createOverrideMutation,
  deleteItemMutation,
  deleteOverrideMutation,
  duplicateAssessmentMutation,
  getAccessOptions,
  getActivityAssessmentOptions,
  getActivityQueryKey,
  getCurriculumQueryKey,
  gradebookOptions,
  lifecycleMutation,
  listOverridesOptions,
  readinessOptions,
  readinessQueryKey,
  reorderItemsMutation,
  setAccessMutation,
  setPolicyMutation,
  updateAssessmentMutation,
  updateItemMutation,
  updateOverrideMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import type {
  AccessView,
  ActivityDetail,
  AssessmentDetail,
  AssessmentItem,
  GradebookPage,
  StudentOverride,
} from '#/shared/api/gen/types.gen'

// Every write's answer goes into the cache of the assessment read by its activity (a refetch would repeat the
// page's GET). Readiness has no answer of its own: it is read again where it is shown.

const byId = (id: string) => ({ path: { assessment_id: id } })

export const assessmentOptions = (activityId: string) =>
  getActivityAssessmentOptions({ path: { activity_id: activityId } })
export const accessOptions = (id: string) => getAccessOptions(byId(id))
export const overridesOptions = (id: string) => listOverridesOptions(byId(id))
export const assessmentReadinessOptions = (id: string) => readinessOptions(byId(id))
export const auditOptions = (id: string) => auditTrailOptions({ ...byId(id), query: { limit: 50 } })

/** Learners of the course: the first gradebook page (its people; the cells are not used). */
export const learnersOptions = (courseId: string) => ({
  ...gradebookOptions({ path: { course_id: courseId }, query: { limit: 500 } }),
  select: (page: GradebookPage) => page.users,
})

const readiness = (id: string) => readinessQueryKey(byId(id))
// The log is read on demand: an invalidation refetches it only while it is shown.
const audit = (id: string) => auditTrailQueryKey({ ...byId(id), query: { limit: 50 } })

const patchAssessment = (
  queryClient: QueryClient,
  activityId: string,
  change: (assessment: AssessmentDetail) => AssessmentDetail,
) =>
  queryClient.setQueryData<AssessmentDetail>(
    assessmentOptions(activityId).queryKey,
    assessment => assessment && change(assessment),
  )

const withItems = (change: (items: AssessmentItem[]) => AssessmentItem[]) => (assessment: AssessmentDetail) => ({
  ...assessment,
  items: change(assessment.items),
})

const renumber = (items: AssessmentItem[]) => items.map((item, at) => ({ ...item, position: at + 1 }))

/** Details, policy and lifecycle answer the whole assessment. */
const putAssessment = (queryClient: QueryClient, activityId: string) => (assessment: AssessmentDetail) =>
  queryClient.setQueryData(assessmentOptions(activityId).queryKey, assessment)

export const updateAssessmentOptions = (queryClient: QueryClient, activityId: string) => ({
  ...updateAssessmentMutation(),
  onSuccess: putAssessment(queryClient, activityId),
})

export const setPolicyOptions = (queryClient: QueryClient, activityId: string, id: string) => ({
  ...setPolicyMutation(),
  onSuccess: putAssessment(queryClient, activityId),
  meta: { invalidates: [readiness(id)] },
})

/** A transition flips the activity's `published` with it (server, BUG-232): the studio header follows. */
export const lifecycleOptions = (queryClient: QueryClient, activityId: string, courseId: string, id: string) => ({
  ...lifecycleMutation(),
  onSuccess: (assessment: AssessmentDetail) => {
    putAssessment(queryClient, activityId)(assessment)
    queryClient.setQueryData<ActivityDetail>(
      getActivityQueryKey({ path: { activity_id: activityId } }),
      activity => activity && { ...activity, published: assessment.lifecycle === 'published' },
    )
  },
  // Readiness does not change with the state (the schedule warning is checked again when scheduling).
  meta: { invalidates: [audit(id), getCurriculumQueryKey({ path: { course_id: courseId } })] },
})

export const createItemOptions = (queryClient: QueryClient, activityId: string, id: string) => ({
  ...createItemMutation(),
  onSuccess: (item: AssessmentItem) =>
    patchAssessment(
      queryClient,
      activityId,
      withItems(items => [...items, item]),
    ),
  meta: { invalidates: [readiness(id)] },
})

export const updateItemOptions = (queryClient: QueryClient, activityId: string, id: string) => ({
  ...updateItemMutation(),
  onSuccess: (item: AssessmentItem) =>
    patchAssessment(
      queryClient,
      activityId,
      withItems(items => items.map(row => (row.id === item.id ? item : row))),
    ),
  meta: { invalidates: [readiness(id)] },
})

export const deleteItemOptions = (queryClient: QueryClient, activityId: string, id: string) => ({
  ...deleteItemMutation(),
  onSuccess: (_: unknown, { path }: { path: { item_id: string } }) =>
    patchAssessment(
      queryClient,
      activityId,
      withItems(items => renumber(items.filter(item => item.id !== path.item_id))),
    ),
  meta: { invalidates: [readiness(id)] },
})

/** A dragged order goes into the cache before its request; the answer (the full list) replaces it. */
export const placeItems = (queryClient: QueryClient, activityId: string, items: AssessmentItem[]) =>
  patchAssessment(
    queryClient,
    activityId,
    withItems(() => items),
  )

export const reorderItemsOptions = (queryClient: QueryClient, activityId: string) => ({
  ...reorderItemsMutation(),
  onSuccess: (items: AssessmentItem[]) => placeItems(queryClient, activityId, items),
})

/** Every access save bumps `policy_version` (server, UX-154): the next `If-Match` takes the bumped one. */
export const setAccessOptions = (queryClient: QueryClient, activityId: string, id: string) => ({
  ...setAccessMutation(),
  onSuccess: (view: AccessView) => {
    queryClient.setQueryData(accessOptions(id).queryKey, view)
    patchAssessment(queryClient, activityId, assessment => ({
      ...assessment,
      policy_version: assessment.policy_version + 1,
    }))
  },
})

const putOverride = (queryClient: QueryClient, id: string) => (saved: StudentOverride) =>
  queryClient.setQueryData<StudentOverride[]>(overridesOptions(id).queryKey, rows => [
    ...(rows ?? []).filter(row => row.user_id !== saved.user_id),
    saved,
  ])

export const createOverrideOptions = (queryClient: QueryClient, id: string) => ({
  ...createOverrideMutation(),
  onSuccess: putOverride(queryClient, id),
})

export const updateOverrideOptions = (queryClient: QueryClient, id: string) => ({
  ...updateOverrideMutation(),
  onSuccess: putOverride(queryClient, id),
})

export const deleteOverrideOptions = (queryClient: QueryClient, id: string) => ({
  ...deleteOverrideMutation(),
  onSuccess: (_: unknown, { path }: { path: { user_id: string } }) =>
    queryClient.setQueryData<StudentOverride[]>(overridesOptions(id).queryKey, rows =>
      rows?.filter(row => row.user_id !== path.user_id),
    ),
})

/** The copy is a new activity of the course: the curriculum is read again where shown. */
export const duplicateOptions = (courseId: string) => ({
  ...duplicateAssessmentMutation(),
  meta: { invalidates: [getCurriculumQueryKey({ path: { course_id: courseId } })] },
})
