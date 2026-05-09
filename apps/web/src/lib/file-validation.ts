/**
 * Frontend file validation utilities
 * Provides consistent validation across all upload components
 */

// File type configurations (matches backend)
export const FILE_TYPES = {
  image: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'],
    maxSize: 10 * 1024 * 1024, // 10MB
  },
  video: {
    extensions: ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.flv'],
    mimeTypes: ['video/mp4', 'video/webm', 'video/x-matroska', 'video/quicktime', 'video/x-msvideo', 'video/x-flv'],
    maxSize: 1000 * 1024 * 1024, // 1000MB
  },
  audio: {
    extensions: ['.mp3', '.wav', '.ogg', '.m4a', '.opus', '.oga'],
    mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/opus', 'audio/mp4', 'audio/x-m4a'],
    maxSize: 100 * 1024 * 1024, // 100MB
  },
  document: {
    extensions: ['.pdf', '.pptx', '.docx', '.zip', '.srt', '.vtt', '.txt'],
    mimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'application/x-zip-compressed',
      'text/vtt',
      'text/plain',
      'application/octet-stream',
    ],
    maxSize: 100 * 1024 * 1024, // 100MB
  },
} as const;

export type FileType = keyof typeof FILE_TYPES;

/**
 * Validate a file against allowed types and size limits
 */
export function validateFile(
  file: File,
  allowedTypes: FileType[],
  customMaxSize?: number,
): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  // Block SVG files explicitly for security
  if (file.name.toLowerCase().endsWith('.svg') || file.type === 'image/svg+xml') {
    return { valid: false, error: 'SVG files are not allowed for security reasons' };
  }

  // Find matching file type by MIME
  let matchedType: FileType | null = null;
  for (const type of allowedTypes) {
    const config = FILE_TYPES[type];
    if ((config.mimeTypes as readonly string[]).includes(file.type)) {
      matchedType = type;
      break;
    }
  }

  // Fallback to extension-only matching when MIME is unavailable or generic
  if (!matchedType) {
    const fileExtension = file.name.toLowerCase().split('.').pop();
    if (fileExtension) {
      for (const type of allowedTypes) {
        const config = FILE_TYPES[type] as { extensions: readonly string[] };
        if (config.extensions.includes(`.${fileExtension}`)) {
          matchedType = type;
          break;
        }
      }
    }
  }

  if (!matchedType) {
    const allowedMimes = allowedTypes.flatMap((type) => FILE_TYPES[type].mimeTypes);
    return {
      valid: false,
      error: `Invalid file type: ${file.type || file.name}. Allowed types: ${allowedMimes.join(', ')}`,
    };
  }

  // Check file size
  const maxSize = customMaxSize || FILE_TYPES[matchedType].maxSize;
  if (file.size > maxSize) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    const maxSizeMB = (maxSize / 1024 / 1024).toFixed(1);
    return {
      valid: false,
      error: `File too large (${sizeMB}MB). Maximum size: ${maxSizeMB}MB`,
    };
  }

  return { valid: true };
}

/**
 * Get accept attribute value for file inputs
 */
export function getAcceptValue(allowedTypes: FileType[]): string {
  return allowedTypes.flatMap((type) => FILE_TYPES[type].mimeTypes).join(',');
}

/**
 * Get human-readable description of allowed file types
 */
export function getFileTypeDescription(allowedTypes: FileType[]): string {
  const extensions = allowedTypes
    .flatMap((type) => FILE_TYPES[type].extensions)
    .map((ext) => ext.toUpperCase().slice(1))
    .join(', ');

  const maxSizes = [...new Set(allowedTypes.map((type) => FILE_TYPES[type].maxSize))];
  // Safely read the first/max size
  const [onlyMaxSize] = maxSizes;
  // Guard against undefined - TypeScript can't infer that maxSizes[0] exists even when length === 1
  const maxSizeStr =
    maxSizes.length === 1 && typeof onlyMaxSize !== 'undefined' ? `${onlyMaxSize / 1024 / 1024}MB` : 'varies';

  return `${extensions} (max ${maxSizeStr})`;
}
