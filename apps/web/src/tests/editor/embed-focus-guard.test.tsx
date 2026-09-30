/** @vitest-environment jsdom */
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

import { useEmbedFocusGuard } from '@components/Objects/Editor/core/useEmbedFocusGuard'

function focusedFrame() {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  frame.focus()
  vi.spyOn(document, 'activeElement', 'get').mockReturnValue(frame)
  return frame
}

describe('useEmbedFocusGuard', () => {
  it('undoes the scroll an embed causes by focusing itself on load', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    renderHook(() => useEmbedFocusGuard())
    focusedFrame()
    window.dispatchEvent(new Event('scroll'))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
    vi.restoreAllMocks()
  })

  it('stands down once the reader has done anything', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    renderHook(() => useEmbedFocusGuard())
    window.dispatchEvent(new Event('wheel'))
    focusedFrame()
    window.dispatchEvent(new Event('scroll'))
    expect(scrollTo).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
