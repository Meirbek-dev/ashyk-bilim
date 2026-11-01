import { useSyncExternalStore } from 'react'

const never = () => () => undefined
const supported = () => document.pictureInPictureEnabled

/**
 * Picture in picture: the video keeps playing in a floating window while the learner reads the rest of the lesson.
 * Known only in the browser (the server renders without the button).
 */
export function usePictureInPicture(element: HTMLVideoElement | null) {
  const available = useSyncExternalStore(never, supported, () => false)
  const subscribe = (notify: () => void) => {
    element?.addEventListener('enterpictureinpicture', notify)
    element?.addEventListener('leavepictureinpicture', notify)
    return () => {
      element?.removeEventListener('enterpictureinpicture', notify)
      element?.removeEventListener('leavepictureinpicture', notify)
    }
  }
  const active = useSyncExternalStore(
    subscribe,
    () => element !== null && document.pictureInPictureElement === element,
    () => false,
  )
  const toggle = () => {
    if (!available || !element) return
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => null)
    else void element.requestPictureInPicture().catch(() => null)
  }
  return { supported: available, active, toggle }
}
