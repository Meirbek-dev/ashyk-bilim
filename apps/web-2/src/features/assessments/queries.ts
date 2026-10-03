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
  listCourseLearnersOptions,
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
  groupsForCourseOptions,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import type {
  AccessView,
  ActivityDetail,
  AssessmentDetail,
  AssessmentItem,
  CourseLearnerPage,
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
/** Groups linked to the course: the only ones an access list may name. */
export const courseGroupsOptions = (courseId: string) => groupsForCourseOptions({ path: { course_id: courseId } })
export const auditOptions = (id: string) => auditTrailOptions({ ...byId(id), query: { limit: 50 } })

// ponytail: the first 100 learners (one keyset page); a searchable picker when courses outgrow it.
/** Learners of the course (its members) for the access and exception pickers. */
export const learnersOptions = (courseId: string) => ({
  ...listCourseLearnersOptions({ path: { course_id: courseId }, query: { limit: 100 } }),
  select: (page: CourseLearnerPage) => page.items,
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

/** An item write answers `assessment_version`: the next `If-Match` of any assessment write takes it. */
const withItems =
  (change: (items: AssessmentItem[]) => AssessmentItem[], version?: number) => (assessment: AssessmentDetail) => ({
    ...assessment,
    items: change(assessment.items),
    version: version ?? assessment.version,
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
      withItems(items => [...items, item], item.assessment_version),
    ),
  meta: { invalidates: [readiness(id)] },
})

export const updateItemOptions = (queryClient: QueryClient, activityId: string, id: string) => ({
  ...updateItemMutation(),
  onSuccess: (item: AssessmentItem) =>
    patchAssessment(
      queryClient,
      activityId,
      withItems(items => items.map(row => (row.id === item.id ? item : row)), item.assessment_version),
    ),
  meta: { invalidates: [readiness(id)] },
})

/** Sent with `Prefer: return=representation`: the answer is the assessment after the delete (renumbered, new version). */
export const deleteItemOptions = (queryClient: QueryClient, activityId: string, id: string) => ({
  ...deleteItemMutation(),
  onSuccess: (assessment: AssessmentDetail | void, { path }: { path: { item_id: string } }) =>
    assessment
      ? putAssessment(queryClient, activityId)(assessment)
      : patchAssessment(
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
  onSuccess: (items: AssessmentItem[]) =>
    patchAssessment(
      queryClient,
      activityId,
      withItems(() => items, items[0]?.assessment_version),
    ),
})

/**
 * The answer carries the access `version` (the next `If-Match` of access). The save also bumps the assessment's
 * `policy_version` (UX-154) and, as a row change, `version` (S-04 trigger): the rules' next `If-Match` take them.
 */
export const setAccessOptions = (queryClient: QueryClient, activityId: string, id: string) => ({
  ...setAccessMutation(),
  onSuccess: (view: AccessView) => {
    queryClient.setQueryData(accessOptions(id).queryKey, view)
    patchAssessment(queryClient, activityId, assessment => ({
      ...assessment,
      policy_version: assessment.policy_version + 1,
      version: assessment.version + 1,
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
