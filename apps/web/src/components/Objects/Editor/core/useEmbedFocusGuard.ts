'use client'

import { useEffect } from 'react'

/** Embeds focus themselves while loading; after this long (or any reader input) the guard stands down. */
const GUARD_WINDOW_MS = 20_000

/**
 * Third-party embeds (Excalidraw, Google Slides, Figma…) focus themselves when they load,
 * and the browser scrolls the page to them — a lesson opened at the top jumped to its
 * middle. Until the reader first scrolls, clicks or types, a scroll that lands while an
 * iframe holds focus is undone and the focus handed back.
 */
export function useEmbedFocusGuard() {
  useEffect(() => {
    const armedUntil = Date.now() + GUARD_WINDOW_MS
    let armed = true
    let lastScrollY = window.scrollY

    const disarm = () => {
      armed = false
    }
    const onScroll = () => {
      const active = document.activeElement
      if (armed && Date.now() < armedUntil && active instanceof HTMLIFrameElement) {
        active.blur()
        window.scrollTo({ top: lastScrollY })
        return
      }
      lastScrollY = window.scrollY
    }

    const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
    for (const type of inputs) window.addEventListener(type, disarm, { capture: true, passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      for (const type of inputs) window.removeEventListener(type, disarm, { capture: true })
      window.removeEventListener('scroll', onScroll)
    }
  }, [])
}
