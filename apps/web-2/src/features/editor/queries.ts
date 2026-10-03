import { createBlockMutation, listBlocksQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'

/** Claims a finalized upload as a file block of the activity (otherwise storage reaps the object). */
export const createBlockOptions = (activityId: string) => ({
  ...createBlockMutation(),
  meta: { invalidates: [listBlocksQueryKey({ path: { id: activityId } })] },
})
