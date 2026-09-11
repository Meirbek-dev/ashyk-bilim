import { FileArchive, FileCode2, FileImage, FileSpreadsheet, FileText, FileVideo } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** Keys under `FileSubmission.mimeCategories` in the catalogs. */
export type MimeCategoryKey =
  | 'pdf'
  | 'documents'
  | 'images'
  | 'spreadsheets'
  | 'presentations'
  | 'archives'
  | 'textAndCode'
  | 'text'
  | 'code'
  | 'video'
  | 'audio'
  | 'anyFile'

export interface MimeCategory {
  key: MimeCategoryKey
  icon: LucideIcon
}

const CATEGORY: Record<MimeCategoryKey, MimeCategory> = {
  pdf: { key: 'pdf', icon: FileText },
  documents: { key: 'documents', icon: FileText },
  images: { key: 'images', icon: FileImage },
  spreadsheets: { key: 'spreadsheets', icon: FileSpreadsheet },
  presentations: { key: 'presentations', icon: FileText },
  archives: { key: 'archives', icon: FileArchive },
  textAndCode: { key: 'textAndCode', icon: FileCode2 },
  text: { key: 'text', icon: FileText },
  code: { key: 'code', icon: FileCode2 },
  video: { key: 'video', icon: FileVideo },
  audio: { key: 'audio', icon: FileVideo },
  anyFile: { key: 'anyFile', icon: FileArchive },
}

/** MIME prefix → category; first match wins, so keep the specific `text/x-*` rows before `text/plain`. */
const MIME_PREFIXES: [string, MimeCategoryKey][] = [
  ['image/', 'images'],
  ['video/', 'video'],
  ['audio/', 'audio'],
  ['text/x-python', 'code'],
  ['text/javascript', 'code'],
  ['text/typescript', 'code'],
  ['text/x-c', 'code'],
  ['text/x-java', 'code'],
  ['text/css', 'code'],
  ['text/html', 'code'],
  ['application/xml', 'code'],
  ['text/plain', 'text'],
  ['text/markdown', 'text'],
  ['application/json', 'text'],
  ['application/pdf', 'documents'],
  ['application/msword', 'documents'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml', 'documents'],
  ['application/vnd.oasis.opendocument.text', 'documents'],
  ['application/rtf', 'documents'],
  ['application/epub', 'documents'],
  ['application/x-mobipocket', 'documents'],
  ['text/csv', 'spreadsheets'],
  ['application/vnd.ms-excel', 'spreadsheets'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml', 'spreadsheets'],
  ['application/vnd.oasis.opendocument.spreadsheet', 'spreadsheets'],
  ['application/vnd.ms-powerpoint', 'presentations'],
  ['application/vnd.openxmlformats-officedocument.presentationml', 'presentations'],
  ['application/zip', 'archives'],
  ['application/x-zip', 'archives'],
  ['application/x-rar', 'archives'],
  ['application/vnd.rar', 'archives'],
  ['application/x-7z', 'archives'],
  ['application/x-tar', 'archives'],
  ['application/gzip', 'archives'],
  ['application/x-gzip', 'archives'],
]

/** Groups raw MIME types into the distinct categories they fall in (label via `FileSubmission.mimeCategories.<key>`). */
export function getMimeCategories(mimes: string[]): MimeCategory[] {
  const keys = new Set<MimeCategoryKey>()
  for (const mime of mimes) {
    const match = MIME_PREFIXES.find(([prefix]) => mime.startsWith(prefix))
    if (match) keys.add(match[1])
  }
  if (keys.size === 0) return [CATEGORY.anyFile]
  return [...keys].map(key => CATEGORY[key])
}
