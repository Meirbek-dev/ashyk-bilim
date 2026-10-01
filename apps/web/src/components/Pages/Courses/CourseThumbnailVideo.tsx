'use client'

import { CheckedMedia } from '@components/Objects/Activities/Media/MediaUnavailable'

/**
 * The course landing's video thumbnail. UX-257: a migrated course whose video
 * object is gone from storage showed a dead black player at 0:00 - the same
 * «Видео недоступно» state as a hosted-video activity (UX-221) replaces it.
 */
export default function CourseThumbnailVideo({ src }: { src: string }) {
  return (
    <CheckedMedia url={src} kind="video">
      <video
        src={src}
        className="h-auto w-full bg-black object-contain"
        controls
        autoPlay
        muted
        preload="metadata"
        playsInline
      />
    </CheckedMedia>
  )
}
