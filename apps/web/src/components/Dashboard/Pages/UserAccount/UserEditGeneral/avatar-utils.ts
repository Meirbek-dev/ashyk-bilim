import { constructAcceptValue } from '@/lib/constants'

export const SUPPORTED_FILES = constructAcceptValue(['jpg', 'png', 'webp', 'gif', 'avif'])
export const SUPPORTED_AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
export const MAX_AVATAR_UPLOAD_BYTES = 2 * 1024 * 1024
export const MAX_AVATAR_SOURCE_BYTES = 10 * 1024 * 1024
export const AVATAR_EXPORT_SIZE = 512
export const AVATAR_EXPORT_QUALITY = 0.88

export async function optimizeAvatarFile(file: File): Promise<File> {
  if (
    typeof document === 'undefined' ||
    typeof globalThis.window === 'undefined' ||
    !('createImageBitmap' in globalThis) ||
    file.type === 'image/gif' ||
    file.type === 'image/avif'
  ) {
    return file
  }

  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file

  try {
    const scale = Math.min(1, AVATAR_EXPORT_SIZE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    if (scale === 1 && file.type === 'image/webp' && file.size <= MAX_AVATAR_UPLOAD_BYTES) {
      return file
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file

    context.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/webp', AVATAR_EXPORT_QUALITY)
    })

    if (!blob || (blob.size >= file.size && file.size <= MAX_AVATAR_UPLOAD_BYTES)) {
      return file
    }

    return new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
      type: 'image/webp',
      lastModified: Date.now(),
    })
  } finally {
    bitmap.close()
  }
}
