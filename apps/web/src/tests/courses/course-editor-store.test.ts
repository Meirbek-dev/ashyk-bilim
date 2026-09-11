import { beforeEach, describe, expect, it } from 'vite-plus/test'

import { useCourseEditorStore } from '@/stores/courses/courseEditorStore'

// Nested course providers hand `openEditor` both `course_<id>` (workspace
// shell) and the bare v2 id (authoring editor); the store must treat them
// as the same course or every structure refetch resets the activity save
// status and the "Activity saved!" indicator never shows.
describe('courseEditorStore.openEditor', () => {
  beforeEach(() => {
    useCourseEditorStore.getState().openEditor('other-course', null)
  })

  it('keeps the activity save status when the same course is opened with and without the legacy prefix', () => {
    const store = useCourseEditorStore.getState()
    store.openEditor('course_abc', '2026-09-12T00:00:00Z')
    store.setActivitySaveStatus('saved')

    useCourseEditorStore.getState().openEditor('abc', '2026-09-12T00:00:01Z')

    const state = useCourseEditorStore.getState()
    expect(state.activitySaveStatus).toBe('saved')
    expect(state.activeCourseUuid).toBe('abc')
    expect(state.lastKnownUpdateDate).toBe('2026-09-12T00:00:01Z')
  })

  it('still resets when a different course is opened', () => {
    const store = useCourseEditorStore.getState()
    store.openEditor('abc', null)
    store.setActivitySaveStatus('saved')

    useCourseEditorStore.getState().openEditor('course_def', null)

    expect(useCourseEditorStore.getState().activitySaveStatus).toBe('idle')
  })
})
