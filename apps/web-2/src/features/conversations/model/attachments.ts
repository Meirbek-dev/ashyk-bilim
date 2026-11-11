import type { AttachmentRequest, FinalizedUpload } from '#/shared/api/gen/types.gen'

/** Files one message carries (contract `SendMessageRequest.attachments`, docs/DIALOGS.md 12). */
export const MAX_FILES = 5

/** Recipients of one bulk send (contract `BulkMessageRequest.to_user_ids`). */
export const MAX_RECIPIENTS = 50

/** A file picked for the next message: uploading, ready (its upload finalized) or failed. */
export type PendingFile = {
  key: string
  file: File
  /** 0..1 while uploading. */
  progress: number
  upload: FinalizedUpload | null
  /** Why it failed (shown under its row), null otherwise. */
  error: string | null
}

export const isUploading = (file: PendingFile) => file.upload === null && file.error === null

/** The files the next send carries, in the order they were picked. */
export const readyAttachments = (files: readonly PendingFile[]): AttachmentRequest[] =>
  files.flatMap(f => (f.upload ? [{ upload_id: f.upload.id, name: f.file.name.slice(0, 255) || 'file' }] : []))

/** What a send waits for: some text or a ready file, and no file still uploading or failed. */
export function sendBlocker(text: string, files: readonly PendingFile[]): 'empty' | 'uploading' | 'failed' | null {
  if (files.some(isUploading)) return 'uploading'
  if (files.some(f => f.error !== null)) return 'failed'
  if (text.trim() === '' && files.length === 0) return 'empty'
  return null
}

/** How many of `picked` still fit next to `current` files. */
export const fitting = <T>(picked: readonly T[], current: number): T[] =>
  picked.slice(0, Math.max(0, MAX_FILES - current))

/** Opens in the browser (an image other than SVG, a PDF); everything else downloads. */
export function opensInline(mime: string): boolean {
  const type = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  return (type.startsWith('image/') && !type.startsWith('image/svg')) || type === 'application/pdf'
}
