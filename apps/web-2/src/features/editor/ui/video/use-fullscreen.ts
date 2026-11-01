import { useEffect, useState } from 'react'

type AppleVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void }

/** A wide video on a phone turns the screen sideways (Android Chrome; other browsers refuse the lock). */
function lockLandscape(video: HTMLVideoElement | null) {
  if (!video || video.videoWidth <= video.videoHeight || !matchMedia('(pointer: coarse)').matches) return
  if ('lock' in screen.orientation) void screen.orientation.lock('landscape').catch(() => null)
}

/** The frame full screen; iPhone Safari has no element full screen, only the video's own (with native controls). */
function enter(frame: HTMLElement | null, video: AppleVideo | null) {
  if (frame?.requestFullscreen) {
    void frame
      .requestFullscreen({ navigationUI: 'hide' })
      .then(() => lockLandscape(video))
      .catch(() => null)
  } else if (video?.webkitEnterFullscreen) {
    // Before its metadata the video refuses (InvalidStateError): start it instead, the next tap goes full screen.
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) video.webkitEnterFullscreen()
    else void video.play().catch(() => null)
  }
}

/** Whether the frame is full screen, and the toggle (the button, F, a double click on the picture). */
export function useFullscreen(frame: HTMLElement | null, video: HTMLVideoElement | null) {
  const [active, setActive] = useState(false)
  useEffect(() => {
    const sync = () => setActive(frame !== null && document.fullscreenElement === frame)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [frame])
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => null)
    else enter(frame, video)
  }
  return { active, toggle }
}
