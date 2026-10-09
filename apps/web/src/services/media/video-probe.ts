export type VideoProbe = 'ok' | 'unplayable' | 'no-picture'

/**
 * Let the browser open a picked video before it is uploaded: a renamed
 * non-video or a file no browser can demux fails here in a second instead of
 * on every learner's player after a long upload. `no-picture` = audio only,
 * or a video codec this browser cannot decode (HEVC in Chrome without
 * hardware support) - other browsers may still show it, so it only warns.
 * Anything slower than `timeoutMs` (or no media support at all) passes.
 */
export function probeVideoFile(file: Blob, timeoutMs = 8000): Promise<VideoProbe> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return Promise.resolve('ok')
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    const done = (result: VideoProbe) => {
      clearTimeout(timer)
      video.removeEventListener('loadedmetadata', onMetadata)
      video.removeEventListener('error', onError)
      video.removeAttribute('src')
      URL.revokeObjectURL(url)
      resolve(result)
    }
    const timer = setTimeout(() => done('ok'), timeoutMs)
    video.preload = 'metadata'
    video.muted = true
    const onMetadata = () => done(video.videoWidth > 0 ? 'ok' : 'no-picture')
    const onError = () => done('unplayable')
    video.addEventListener('loadedmetadata', onMetadata)
    video.addEventListener('error', onError)
    video.src = url
  })
}
