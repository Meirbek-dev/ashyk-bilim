import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vite-plus/test'

import {
  deleteActivityMutationOptions,
  updateActivityMutationOptions,
} from '@/features/courses/mutations/activity.mutation'
import { updateChapterMutationOptions } from '@/features/courses/mutations/chapter.mutation'

vi.mock('@/services/courses/activities', () => ({
  createActivity: vi.fn(),
  createExternalVideoActivity: vi.fn(),
  deleteActivity: vi.fn(),
  updateActivity: vi.fn(),
}))
vi.mock('@/services/courses/activity-uploads', () => ({ createFileActivity: vi.fn() }))
vi.mock('@/services/courses/chapters', () => ({
  createChapter: vi.fn(),
  deleteChapter: vi.fn(),
  updateChapter: vi.fn(),
  updateCourseOrderStructure: vi.fn(),
}))

// BUG-340 (audit AUD-002): the optimistic updaters mutated the cached
// chapter/activity objects, so the rollback snapshot already held the
// rejected edit and onError restored it.
const key = ['courses', 'structure', 'course-1', true]
const seeded = () => {
  const client = new QueryClient()
  client.setQueryData(key, {
    chapters: [{ chapter_uuid: 'c', name: 'chapter', activities: [{ activity_uuid: 'a', name: 'original' }] }],
  })
  return client
}
const snapshot = {
  chapters: [{ chapter_uuid: 'c', name: 'chapter', activities: [{ activity_uuid: 'a', name: 'original' }] }],
}

describe('curriculum optimistic rollback', () => {
  it('a failed activity update restores the original', async () => {
    const client = seeded()
    const options = updateActivityMutationOptions(client, key)
    const context = await options.onMutate!({ activityUuid: 'a', payload: { name: 'rejected' } }, {} as never)
    expect(client.getQueryData(key)).toMatchObject({ chapters: [{ activities: [{ name: 'rejected' }] }] })
    await options.onError!(new Error('rejected'), {} as never, context, {} as never)
    expect(client.getQueryData(key)).toEqual(snapshot)
  })

  it('a failed activity delete restores the activity', async () => {
    const client = seeded()
    const options = deleteActivityMutationOptions(client, key)
    const context = await options.onMutate!('a', {} as never)
    await options.onError!(new Error('rejected'), 'a', context, {} as never)
    expect(client.getQueryData(key)).toEqual(snapshot)
  })

  it('a failed chapter update restores the original', async () => {
    const client = seeded()
    const options = updateChapterMutationOptions(client, key)
    const context = await options.onMutate!({ chapterUuid: 'c', payload: { name: 'rejected' } }, {} as never)
    await options.onError!(new Error('rejected'), {} as never, context, {} as never)
    expect(client.getQueryData(key)).toEqual(snapshot)
  })
})
