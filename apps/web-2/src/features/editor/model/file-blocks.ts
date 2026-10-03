import type { UploadPurpose } from '#/shared/api/upload'

/** The block types that hold an uploaded file, with their upload purpose and `createBlock` type. */
export const FILE_BLOCKS = {
  blockImage: { purpose: 'block-image', blockType: 'image' },
  blockPDF: { purpose: 'block-pdf', blockType: 'pdf' },
  blockVideo: { purpose: 'block-video', blockType: 'video' },
} as const satisfies Record<string, { purpose: UploadPurpose; blockType: string }>

export type FileBlock = keyof typeof FILE_BLOCKS

export const isFileBlock = (name: string): name is FileBlock => Object.hasOwn(FILE_BLOCKS, name)

/** The block a pasted or dropped file becomes, by its type; null = not ours (the editor handles it as usual). */
export function fileBlockFor(mime: string): FileBlock | null {
  if (mime.startsWith('image/')) return 'blockImage'
  if (mime === 'application/pdf') return 'blockPDF'
  if (mime.startsWith('video/')) return 'blockVideo'
  return null
}

/**
 * The stored `blockObject` of a claimed upload (the old editor's shape): `file_key` is served at `/content/<key>`,
 * `file_id` + `file_format` keep legacy readers working.
 */
export function fileBlockObject(blockId: string, upload: { id: string; key: string }, fileName: string) {
  const dot = fileName.lastIndexOf('.')
  return {
    block_uuid: blockId,
    content: {
      file_id: upload.id,
      file_key: upload.key,
      file_format: dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase(),
      file_name: fileName,
    },
  }
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Media time as m:ss or h:mm:ss (digits only, no locale needed). */
export function clock(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const [h, min, s] = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
  return h > 0 ? `${h}:${pad(min)}:${pad(s)}` : `${min}:${pad(s)}`
}
