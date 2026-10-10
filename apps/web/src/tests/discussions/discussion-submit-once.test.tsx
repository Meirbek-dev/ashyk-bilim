/** @vitest-environment jsdom */
// A double click on «Опубликовать» posted the message twice, and a failed post (no network) cleared the editor:
// the forms submit once at a time and clear only when the server took the text.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

import { useSubmitOnce } from '@/components/discussions/text'

describe('useSubmitOnce', () => {
  it('runs one submission at a time', async () => {
    const { result } = renderHook(() => useSubmitOnce())
    let finish: (ok: boolean) => void = () => {}
    const submit = vi.fn(() => new Promise<boolean>(resolve => (finish = resolve)))
    let first: Promise<boolean> = Promise.resolve(false)
    let second: Promise<boolean> = Promise.resolve(true)
    act(() => {
      first = result.current.run(submit)
      second = result.current.run(submit)
    })
    expect(await second).toBe(false)
    expect(result.current.pending).toBe(true)
    await act(async () => finish(true))
    expect(await first).toBe(true)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(result.current.pending).toBe(false)
  })

  it('reports a failed submission so the form keeps the text', async () => {
    const { result } = renderHook(() => useSubmitOnce())
    let ok = true
    await act(async () => {
      ok = await result.current.run(() => Promise.reject(new Error('offline')))
    })
    expect(ok).toBe(false)
    expect(result.current.pending).toBe(false)
  })
})
