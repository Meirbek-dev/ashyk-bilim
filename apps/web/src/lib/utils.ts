export { cn } from 'cn'

/** A v4 UUID from the Web Crypto API (every browser Next supports and Node ship it). */
export function generateUUID(): string {
  return crypto.randomUUID()
}

const YOUTUBE_VIDEO_ID_LENGTH = 11

export const getYouTubeVideoId = (url: string): string | null => {
  if (!url) return null

  // watch?v=, youtu.be/, embed/, v/, shorts/, live/ - on www., m., music. and youtube-nocookie.com.
  const youtubeRegex =
    /(?:youtube(?:-nocookie)?\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[&?]v=)|youtu\.be\/)([^\s"&/?#]{11})/i
  const match = youtubeRegex.exec(url)

  return match?.[1]?.length === YOUTUBE_VIDEO_ID_LENGTH ? match[1] : null
}
