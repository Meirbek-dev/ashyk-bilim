'use client'

import { FileWarning } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * UX-221: a hosted file whose storage object is gone (legacy dangling key) -
 * the proxy answers 404 or S3 `AccessDenied` (403). One same-origin HEAD tells
 * it apart from a slow load, so the player/viewer can show a message instead
 * of «Reconnect: N» or raw S3 XML. `blob:`/`data:` previews are never checked.
 */
export function useMediaMissing(url: string | null | undefined): boolean {
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    if (!url || /^(blob|data):/.test(url)) return
    const controller = new AbortController()
    fetch(url, { method: 'HEAD', signal: controller.signal })
      .then(res => setMissing(res.status === 404 || res.status === 403))
      .catch(() => undefined) // offline / aborted: let the player report it
    return () => controller.abort()
  }, [url])
  return missing
}

/** `unplayable`: the object is there but the browser cannot demux or decode it. */
export function MediaUnavailable({ kind, unplayable = false }: { kind: 'video' | 'pdf'; unplayable?: boolean }) {
  const t = useTranslations('Components.MediaUnavailable')
  return (
    <div
      role="alert"
      className="bg-muted/40 text-muted-foreground flex aspect-video h-full w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center"
    >
      <FileWarning className="size-8" aria-hidden="true" />
      <p className="text-foreground font-medium">{t(kind)}</p>
      <p className="text-sm">{t(unplayable ? 'unplayableHint' : 'hint')}</p>
    </div>
  )
}

/** Renders `children` (an iframe/player for `url`) unless the object is missing. */
export function CheckedMedia({
  url,
  kind,
  children,
}: {
  url: string | null | undefined
  kind: 'video' | 'pdf'
  children: ReactNode
}) {
  return useMediaMissing(url) ? <MediaUnavailable kind={kind} /> : children
}
