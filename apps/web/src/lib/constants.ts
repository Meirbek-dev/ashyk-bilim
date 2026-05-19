export const ACCEPTED_FILE_FORMATS = {
  video: 'video/*',
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  flv: 'video/x-flv',
  // Removed 'image: image/*' to prevent SVG uploads - use specific formats instead
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  opus: 'audio/opus',
  oga: 'audio/ogg',
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  zip: 'application/zip,application/x-zip-compressed',
  srt: '.srt',
  vtt: 'text/vtt',
  txt: 'text/plain',
} as const;

export const SESSION_CACHE_TTL_MS = 1 * 60 * 1000;
export const TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000;
export const SESSION_CACHE_MAX_SIZE = 1000;
export const PLATFORM_BRAND_NAME = 'Ashyk Bilim';
export const PLATFORM_DESCRIPTION = 'Образовательная платформа для онлайн-обучения';
export const PLATFORM_LABEL = 'ashyq-bilim';
export const PLATFORM_THUMBNAIL_IMAGE_PATH = '/platform_logo_full.svg';
export const NAVBAR_HEIGHT = 60;

/**
 * Constructs the 'accept' attribute value for an input element.
 */
export function constructAcceptValue(types: (keyof typeof ACCEPTED_FILE_FORMATS)[]): string {
  return types
    .map((type) => ACCEPTED_FILE_FORMATS[type])
    .filter(Boolean)
    .join(',');
}
