import { uploadPolicy } from '#/shared/api/gen/upload-policy.gen'
import type { UploadPurpose } from '#/shared/api/gen/types.gen'

const absolute = (key: string) => /^https?:\/\//i.test(key)

/**
 * Public storage keys (`avatar_key`, thumbnails...) are served anonymously at /content/<key>. Accounts migrated from
 * the old platform keep their Google photo as an absolute `https://` URL in `avatar_key`: that one is used as is.
 */
export const contentUrl = (key: string) => (absolute(key) ? key : `/content/${key}`)

/**
 * The WebP previews the server writes next to a picture of `purpose` (`/content/<key>.w<width>`, ARCHITECTURE 11), as
 * the smallest one's `src` and a `srcSet` of all; `null` when the purpose has none or the key is an absolute URL. A
 * preview appears a moment after the upload (a job writes it), so a caller falls back to `contentUrl` on error.
 */
export function contentPreviews(key: string, purpose: UploadPurpose): { src: string; srcSet: string } | null {
  const widths = uploadPolicy[purpose].previewWidths
  const smallest = widths[0]
  if (absolute(key) || smallest === undefined) return null
  return {
    src: `/content/${key}.w${smallest}`,
    srcSet: widths.map(width => `/content/${key}.w${width} ${width}w`).join(', '),
  }
}
