import { useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

/**
 * Says the new page's title after an in-app navigation (WCAG 4.1.3). A full load is announced by the browser; a client
 * navigation only swaps the content and the title, so a screen-reader user heard nothing and stayed on the link they
 * pressed. The title is read once the new page has rendered its head.
 */
export function RouteAnnouncer() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  useEffect(
    () =>
      router.subscribe('onRendered', ({ fromLocation, pathChanged }) => {
        if (!fromLocation || !pathChanged) return
        requestAnimationFrame(() => setTitle(document.title))
      }),
    [router],
  )
  return (
    <p aria-live="polite" aria-atomic="true" className="sr-only">
      {title}
    </p>
  )
}
