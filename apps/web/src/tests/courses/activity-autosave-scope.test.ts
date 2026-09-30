import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { useActivityAutosave } from '@/hooks/useActivityAutosave'
import { APIError } from '@/lib/api/assertSuccess'
import { useCourseEditorStore } from '@/stores/courses/courseEditorStore'

const updateActivity = vi.fn()
vi.mock('@/hooks/mutations/useActivityMutations', () => ({
  useActivityMutations: () => ({ updateActivity }),
}))
const getActivity = vi.fn()
vi.mock('@services/courses/activities', () => ({ getActivity: (id: string) => getActivity(id) }))

// BUG-282: a 412 in one lesson stopped autosave in the next lesson opened
// in-app (the save status was course-wide) — its typing was lost.
describe('useActivityAutosave scope', () => {
  beforeEach(() => {
    updateActivity.mockReset()
    useCourseEditorStore.getState().openEditor('other-course', null)
    useCourseEditorStore.getState().openEditor('course-1', null)
  })

  it('a conflict in one activity never stops another', async () => {
    const { result, rerender } = renderHook(
      ({ id }) => useActivityAutosave({ activityUuid: id, courseUuid: 'course-1' }),
      {
        initialProps: { id: 'act-a' },
      },
    )
    updateActivity.mockResolvedValueOnce({ version: 5 })
    await act(() => result.current.flush({ version: 4 }))
    updateActivity.mockRejectedValueOnce(new APIError({ status: 412, code: 'precondition-failed', message: 'stale' }))
    await act(() => result.current.flush({ version: 4 }).catch(() => undefined))
    expect(result.current.saveStatus).toBe('conflict')

    rerender({ id: 'act-b' })
    expect(result.current.saveStatus).toBe('idle')
    act(() => result.current.onChange({ version: 2 }))
    expect(result.current.saveStatus).toBe('saving')
    updateActivity.mockResolvedValueOnce({ version: 3 })
    await act(() => result.current.flush({ version: 2 }))
    expect(updateActivity).toHaveBeenLastCalledWith('act-b', { version: 2 })
    expect(result.current.saveStatus).toBe('saved')
  })

  // UX-214: a 403 (author removed mid-edit) is its own state and stops autosave.
  it('a 403 stops autosave as forbidden', async () => {
    const { result } = renderHook(() => useActivityAutosave({ activityUuid: 'act-c', courseUuid: 'course-1' }))
    updateActivity.mockRejectedValueOnce(new APIError({ status: 403, code: 'forbidden', message: 'not an author' }))
    await act(() => result.current.flush({ version: 1 }).catch(() => undefined))
    expect(result.current.saveStatus).toBe('forbidden')
    act(() => result.current.onChange({ version: 1 }))
    expect(result.current.saveStatus).toBe('forbidden')
  })
})

// BUG-339 (audit AUD-001): writes are serialized per activity, carry the
// acknowledged version, and a debounced payload never reaches another lesson.
describe('useActivityAutosave serialization', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    updateActivity.mockReset()
    useCourseEditorStore.getState().openEditor('other-course', null)
    useCourseEditorStore.getState().openEditor('course-1', null)
  })
  afterEach(() => vi.useRealTimers())

  it('holds later saves until the in-flight write answers, then sends only the newest with its version', async () => {
    const first = Promise.withResolvers<{ version: number }>()
    updateActivity.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ version: 3 })
    const { result } = renderHook(() => useActivityAutosave({ activityUuid: 'lesson-a', courseUuid: 'course-1' }))
    act(() => result.current.onChange({ version: 1, content: 'A' }))
    await act(() => vi.advanceTimersByTimeAsync(1500))
    act(() => result.current.onChange({ version: 1, content: 'B' }))
    await act(() => vi.advanceTimersByTimeAsync(1500))
    let manual: Promise<void> = Promise.resolve()
    act(() => {
      manual = result.current.flush({ version: 1, content: 'C' })
    })
    expect(updateActivity).toHaveBeenCalledTimes(1)
    await act(async () => {
      first.resolve({ version: 2 })
      await manual
    })
    expect(updateActivity).toHaveBeenCalledTimes(2)
    expect(updateActivity).toHaveBeenLastCalledWith('lesson-a', { version: 2, content: 'C' })
    expect(result.current.saveStatus).toBe('saved')
  })

  // Re-verify: a manual Save queued behind an autosave that hits 412 was
  // resolved as skipped, so the editor toasted «saved» for a write that
  // never happened.
  it('a manual save queued behind a write that hits 412 rejects, never reports success', async () => {
    const first = Promise.withResolvers<{ version: number }>()
    updateActivity.mockReturnValueOnce(first.promise)
    const { result } = renderHook(() => useActivityAutosave({ activityUuid: 'lesson-a', courseUuid: 'course-1' }))
    act(() => result.current.onChange({ version: 1, content: 'autosaved' }))
    await act(() => vi.advanceTimersByTimeAsync(1500))
    let manual: Promise<void> = Promise.resolve()
    act(() => {
      manual = result.current.flush({ version: 1, content: 'typed before save' })
    })
    const outcome = manual.then(
      () => 'resolved',
      (error: unknown) => (error instanceof APIError ? error.code : 'other'),
    )
    await act(async () => {
      first.reject(new APIError({ status: 412, code: 'precondition-failed', message: 'stale' }))
      await outcome
    })
    expect(await outcome).toBe('precondition-failed')
    expect(updateActivity).toHaveBeenCalledTimes(1)
    expect(result.current.saveStatus).toBe('conflict')
    // And a later Save on the stopped lesson fails too, without a request.
    await expect(result.current.flush({ version: 1 })).rejects.toMatchObject({ code: 'precondition-failed' })
    expect(updateActivity).toHaveBeenCalledTimes(1)
  })

  it('manual save cancels the pending debounce', async () => {
    updateActivity.mockResolvedValue({ version: 2 })
    const { result } = renderHook(() => useActivityAutosave({ activityUuid: 'lesson-a', courseUuid: 'course-1' }))
    act(() => result.current.onChange({ version: 1, content: 'typed' }))
    await act(() => result.current.flush({ version: 1, content: 'typed' }))
    await act(() => vi.advanceTimersByTimeAsync(1500))
    expect(updateActivity).toHaveBeenCalledTimes(1)
  })

  it('does not deliver an old lesson payload to a newly selected lesson', async () => {
    updateActivity.mockResolvedValue({ version: 2 })
    const { result, rerender } = renderHook(
      ({ id }) => useActivityAutosave({ activityUuid: id, courseUuid: 'course-1' }),
      { initialProps: { id: 'lesson-a' } },
    )
    act(() => result.current.onChange({ version: 1, content: 'lesson A content' }))
    rerender({ id: 'lesson-b' })
    await act(() => vi.advanceTimersByTimeAsync(1500))
    expect(updateActivity.mock.calls.map(([id]) => id)).toEqual(['lesson-a'])
  })
})

// BUG-376: a curriculum rename / publish toggle bumps the version; the open
// editor rebases a content-only save instead of stopping — but only while
// the server still holds the content this tab last saw.
describe('useActivityAutosave rebase', () => {
  const stale = () => new APIError({ status: 412, code: 'precondition-failed', message: 'stale' })
  beforeEach(() => {
    updateActivity.mockReset()
    getActivity.mockReset()
    useCourseEditorStore.getState().openEditor('other-course', null)
    useCourseEditorStore.getState().openEditor('course-1', null)
  })

  it('retries with the current version after a metadata-only change', async () => {
    const loaded = { type: 'doc', content: [{ type: 'paragraph', text: 'one' }] }
    const { result } = renderHook(() =>
      useActivityAutosave({ activityUuid: 'lesson-r', courseUuid: 'course-1', loadedContent: loaded }),
    )
    // jsonb hands the same document back with its keys reordered.
    getActivity.mockResolvedValueOnce({
      version: 2,
      content: { content: [{ text: 'one', type: 'paragraph' }], type: 'doc' },
    })
    updateActivity.mockRejectedValueOnce(stale()).mockResolvedValueOnce({ version: 3 })
    await act(() => result.current.flush({ content: { type: 'doc', text: 'typed' }, version: 1 }))
    expect(updateActivity).toHaveBeenLastCalledWith('lesson-r', { content: { type: 'doc', text: 'typed' }, version: 2 })
    expect(result.current.saveStatus).toBe('saved')

    // Another tab changed the text: a real conflict, nothing is overwritten.
    getActivity.mockResolvedValueOnce({ version: 5, content: { type: 'doc', text: 'other tab' } })
    updateActivity.mockRejectedValueOnce(stale())
    await expect(result.current.flush({ content: { type: 'doc', text: 'mine' }, version: 1 })).rejects.toMatchObject({
      code: 'precondition-failed',
    })
    expect(updateActivity).toHaveBeenCalledTimes(3)
    expect(result.current.saveStatus).toBe('conflict')
  })
})
