import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

// Visually hidden (the shadow tree does not see the app's `sr-only`).
const HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap'

/**
 * Says the new page's title after an in-app navigation (WCAG 4.1.3). A full load is announced by the browser; a client
 * navigation only swaps the content and the title, so a screen-reader user heard nothing and stayed on the link they
 * pressed. The title is read once the new page has rendered its head.
 *
 * The live region sits in a closed shadow root: screen readers read it like any other, but a text lookup of the page
 * (find in page, a test's `getByText(<course name>)`) never meets the title a second time.
 */
export function RouteAnnouncer() {
  const router = useRouter()
  const host = useRef<HTMLDivElement>(null)
  const region = useRef<HTMLParagraphElement | null>(null)
  useEffect(() => {
    if (!region.current && host.current) {
      const live = document.createElement('p')
      live.setAttribute('aria-live', 'polite')
      live.setAttribute('aria-atomic', 'true')
      live.style.cssText = HIDDEN
      host.current.attachShadow({ mode: 'closed' }).append(live)
      region.current = live
    }
    return router.subscribe('onRendered', ({ fromLocation, pathChanged }) => {
      if (!fromLocation || !pathChanged) return
      requestAnimationFrame(() => {
        if (region.current) region.current.textContent = document.title
      })
    })
  }, [router])
  return <div ref={host} />
}
