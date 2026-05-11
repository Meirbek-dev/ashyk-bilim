import { twMerge } from 'tailwind-merge';
import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function debounce<T extends (...args: any[]) => void>(func: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return function (this: any, ...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  } as T;
}

/**
 * Generates a UUID. Uses the Web Crypto API (available in all modern browsers
 * and Node.js 14.17+). Falls back to a simple time-based id for ancient envs.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Minimal fallback (RFC 4122 v4 shape) — no external dependency needed.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const value = c === 'x' ? r : (r % 4) + 8;
    return value.toString(16);
  });
}

const YOUTUBE_HOSTNAMES = new Set(['youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtu.be']);
const YOUTUBE_VIDEO_ID_LENGTH = 11;

export const isYouTubeUrl = (url: string): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return YOUTUBE_HOSTNAMES.has(parsed.hostname);
  } catch {
    return false;
  }
};

export const getYouTubeVideoId = (url: string): string | null => {
  if (!url) return null;

  const youtubeRegex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[&?]v=)|youtu\.be\/)([^\s"&/?]{11})/i;
  const match = youtubeRegex.exec(url);

  return match?.[1]?.length === YOUTUBE_VIDEO_ID_LENGTH ? match[1] : null;
};
