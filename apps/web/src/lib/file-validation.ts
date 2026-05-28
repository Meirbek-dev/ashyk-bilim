/**
 * Frontend file validation utilities
 * Provides consistent validation across all upload components
 */

// File type configurations (matches backend)
export const FILE_TYPES = {
  image: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'],
    maxSize: 20 * 1024 * 1024, // 20MB
  },
  video: {
    extensions: ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.flv'],
    mimeTypes: [
      'video/mp4',
      'video/webm',
      'video/x-matroska',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-flv',
    ],
    maxSize: 2000 * 1024 * 1024, // 2GB
  },
  audio: {
    extensions: ['.mp3', '.wav', '.ogg', '.m4a', '.opus', '.oga', '.flac'],
    mimeTypes: [
      'audio/mpeg',
      'audio/wav',
      'audio/x-wav',
      'audio/ogg',
      'audio/opus',
      'audio/mp4',
      'audio/x-m4a',
      'audio/flac',
    ],
    maxSize: 200 * 1024 * 1024, // 200MB
  },
  document: {
    extensions: ['.pdf', '.pptx', '.docx', '.doc', '.ppt', '.odt', '.rtf', '.epub', '.mobi'],
    mimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.ms-powerpoint',
      'application/vnd.oasis.opendocument.text',
      'application/rtf',
      'application/epub+zip',
      'application/x-mobipocket-ebook',
    ],
    maxSize: 200 * 1024 * 1024, // 200MB
  },
  spreadsheet: {
    extensions: ['.csv', '.xls', '.xlsx', '.ods'],
    mimeTypes: [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.spreadsheet',
    ],
    maxSize: 100 * 1024 * 1024, // 100MB
  },
  archive: {
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz'],
    mimeTypes: [
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/vnd.rar',
      'application/x-7z-compressed',
      'application/x-tar',
      'application/gzip',
      'application/x-gzip',
    ],
    maxSize: 1000 * 1024 * 1024, // 1GB
  },
  text: {
    extensions: [
      '.txt',
      '.md',
      '.json',
      '.srt',
      '.vtt',
      '.py',
      '.js',
      '.ts',
      '.css',
      '.html',
      '.xml',
      '.cpp',
      '.c',
      '.java',
    ],
    mimeTypes: [
      'text/plain',
      'text/markdown',
      'application/json',
      'text/vtt',
      'application/x-subrip',
      'text/x-python',
      'text/javascript',
      'text/typescript',
      'text/css',
      'text/html',
      'application/xml',
      'text/x-c++src',
      'text/x-csrc',
      'text/x-java-source',
    ],
    maxSize: 20 * 1024 * 1024, // 20MB
  },
} as const

export type FileType = keyof typeof FILE_TYPES

/**
 * Validate a file against allowed types and size limits
 */
export function validateFile(
  file: File,
  allowedTypes: FileType[],
  customMaxSize?: number,
): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file selected' }
  }

  // Block SVG files explicitly for security
  if (file.name.toLowerCase().endsWith('.svg') || file.type === 'image/svg+xml') {
    return {
      valid: false,
      error: 'SVG files are not allowed for security reasons',
    }
  }

  // Find matching file type by MIME
  let matchedType: FileType | null = null
  for (const type of allowedTypes) {
    const config = FILE_TYPES[type]
    if ((config.mimeTypes as readonly string[]).includes(file.type)) {
      matchedType = type
      break
    }
  }

  // Fallback to extension-only matching when MIME is unavailable or generic
  if (!matchedType) {
    const fileExtension = file.name.toLowerCase().split('.').pop()
    if (fileExtension) {
      for (const type of allowedTypes) {
        const config = FILE_TYPES[type] as { extensions: readonly string[] }
        if (config.extensions.includes(`.${fileExtension}`)) {
          matchedType = type
          break
        }
      }
    }
  }

  if (!matchedType) {
    const allowedMimes = allowedTypes
      .flatMap(type => FILE_TYPES[type].mimeTypes)
      .map(getFriendlyMimeName)
    return {
      valid: false,
      error: `Invalid file type: ${file.type || file.name}. Allowed types: ${allowedMimes.join(', ')}`,
    }
  }

  // Check file size
  const maxSize = customMaxSize || FILE_TYPES[matchedType].maxSize
  if (file.size > maxSize) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1)
    const maxSizeMB = (maxSize / 1024 / 1024).toFixed(1)
    return {
      valid: false,
      error: `File too large (${sizeMB}MB). Maximum size: ${maxSizeMB}MB`,
    }
  }

  return { valid: true }
}

/**
 * Get accept attribute value for file inputs
 */
export function getAcceptValue(allowedTypes: FileType[]): string {
  return allowedTypes.flatMap(type => FILE_TYPES[type].mimeTypes).join(',')
}

/**
 * Get human-readable description of allowed file types
 */
export function getFileTypeDescription(allowedTypes: FileType[]): string {
  const extensions = allowedTypes
    .flatMap(type => FILE_TYPES[type].extensions)
    .map(ext => ext.toUpperCase().slice(1))
    .join(', ')

  const maxSizes = [...new Set(allowedTypes.map(type => FILE_TYPES[type].maxSize))]
  // Safely read the first/max size
  const [onlyMaxSize] = maxSizes
  // Guard against undefined - TypeScript can't infer that maxSizes[0] exists even when length === 1
  const maxSizeStr =
    maxSizes.length === 1 && typeof onlyMaxSize !== 'undefined'
      ? `${onlyMaxSize / 1024 / 1024}MB`
      : 'varies'

  return `${extensions} (max ${maxSizeStr})`
}

/**
 * Mapping of MIME types to short, user-friendly names
 */
export const MIME_TO_FRIENDLY_NAME: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/jpg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
  'image/gif': 'GIF',
  'image/avif': 'AVIF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.oasis.opendocument.text': 'ODT',
  'text/csv': 'CSV',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.oasis.opendocument.spreadsheet': 'ODS',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'application/zip': 'ZIP',
  'application/x-zip-compressed': 'ZIP',
  'application/x-rar-compressed': 'RAR',
  'application/vnd.rar': 'RAR',
  'application/x-7z-compressed': '7Z',
  'application/x-tar': 'TAR',
  'application/gzip': 'GZ',
  'application/x-gzip': 'GZ',
  'text/plain': 'TXT',
  'text/markdown': 'MD',
  'application/json': 'JSON',
  'video/mp4': 'MP4',
  'video/webm': 'WEBM',
  'video/x-matroska': 'MKV',
  'video/quicktime': 'MOV',
  'audio/mpeg': 'MP3',
  'audio/wav': 'WAV',
  'audio/flac': 'FLAC',
  'application/epub+zip': 'EPUB',
  'application/x-mobipocket-ebook': 'MOBI',
  'text/x-python': 'PY',
  'text/javascript': 'JS',
  'text/typescript': 'TS',
  'text/css': 'CSS',
  'text/html': 'HTML',
  'application/xml': 'XML',
  'text/x-c++src': 'CPP',
  'text/x-csrc': 'C',
  'text/x-java-source': 'JAVA',
  'image/*': 'Images',
  'video/*': 'Videos',
  'audio/*': 'Audio',
}

/**
 * Returns a short, friendly name for a MIME type, or the MIME type itself if unknown.
 */
export function getFriendlyMimeName(mime: string): string {
  return MIME_TO_FRIENDLY_NAME[mime] ?? mime
}
