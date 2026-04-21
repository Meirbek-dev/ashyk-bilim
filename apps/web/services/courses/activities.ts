'use server';

import { getResponseMetadata } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import { shouldUseChunkedUpload, uploadFileChunked } from '@services/utils/chunked-upload';
import type { CustomResponseTyping } from '@/lib/api-client';
import type { components } from '@/lib/api/generated';
import { getAPIUrl } from '@services/config/config';

type ActivityRead = components['schemas']['ActivityRead'];
type ActivityReadWithPermissions = components['schemas']['ActivityReadWithPermissions'];
type ActivityDetailResponse = components['schemas']['ActivityDetailResponse'];

export interface UrlPreviewResponse {
  title?: string | null;
  description?: string | null;
  og_image?: string | null;
  favicon?: string | null;
  og_type?: string | null;
  og_url?: string | null;
}

type ResponseMetadata<T> = Omit<CustomResponseTyping, 'data'> & {
  data: T | null;
};

async function getTypedResponseMetadata<T>(response: Response): Promise<ResponseMetadata<T>> {
  return await getResponseMetadata(response);
}

interface UploadProgress {
  percentage: number;
  currentChunk?: number;
  totalChunks?: number;
}

interface ActivityInvalidationOptions {
  courseUuid?: string;
}

export async function createActivity(data: any, chapter_id: number, options?: ActivityInvalidationOptions) {
  if (!data.content) {
    data.content = {};
  }
  data.chapter_id = chapter_id;

  const result = await apiFetch('activities/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return getTypedResponseMetadata<ActivityRead>(result);
}

/**
 * Builds video details object from data for FormData submission
 */
function buildVideoDetails(details: any): string {
  const detailsToSend: any = {
    startTime: details.startTime || 0,
    endTime: details.endTime || null,
    autoplay: details.autoplay,
    muted: details.muted,
  };

  if (details.subtitles) {
    detailsToSend.subtitles = details.subtitles.map((subtitle: any) => ({
      id: subtitle.id,
      language: subtitle.language,
      label: subtitle.label,
    }));
  }

  return JSON.stringify(detailsToSend);
}

/**
 * Appends subtitle files to FormData
 */
function appendSubtitleFiles(formData: FormData, subtitles: any[]): void {
  for (const subtitle of subtitles) {
    if (subtitle.file) {
      formData.append('subtitle_files', subtitle.file);
    }
  }
}

/**
 * Upload FormData with progress tracking - uses XHR in browser, fetch on server
 */
async function uploadFormData(
  path: string,
  formData: FormData,
  onProgress?: (progress: UploadProgress) => void,
): Promise<ActivityRead> {
  const result = await apiFetch(path, { method: 'POST', body: formData });

  if (!result.ok) {
    let detail = `Upload failed with status ${result.status}`;
    try {
      const errorData = await result.json();
      if (typeof errorData?.detail === 'string') {
        ({ detail } = errorData);
      }
    } catch {
      // Ignore JSON parse failures and preserve the generic message.
    }
    const error: any = new Error(detail);
    error.status = result.status;
    error.detail = detail;
    throw error;
  }

  const json = (await result.json()) as ActivityRead;
  if (onProgress) {
    try {
      onProgress({ percentage: 100 });
    } catch {
      // ignore
    }
  }
  return json;
}

/**
 * Create video activity with chunked upload for large files
 */
async function createVideoActivityChunked(
  file: File,
  data: any,
  chapterId: number,
  options?: ActivityInvalidationOptions,
  onProgress?: (progress: UploadProgress) => void,
): Promise<ActivityRead> {
  const courseUuid = data.course_uuid;

  if (!courseUuid) {
    throw new Error('Missing course_uuid for chunked upload');
  }

  const tempActivityUuid = `activity_temp_${Date.now()}`;
  const videoFormat = file.name.split('.').pop() || 'mp4';

  await uploadFileChunked({
    file,
    directory: `courses/${courseUuid}/activities/${tempActivityUuid}/video`,
    typeOfDir: 'platform',
    filename: `video.${videoFormat}`,
    onProgress: (progress) => {
      onProgress?.({
        percentage: progress.percentage,
        currentChunk: progress.currentChunk,
        totalChunks: progress.totalChunks,
      });
    },
  });

  const formData = new FormData();
  formData.append('chapter_id', chapterId.toString());
  formData.append('name', data.name);
  formData.append(
    'video_uploaded_path',
    `courses/${courseUuid}/activities/${tempActivityUuid}/video/video.${videoFormat}`,
  );

  if (data.details?.subtitles && Array.isArray(data.details.subtitles)) {
    appendSubtitleFiles(formData, data.details.subtitles);
  }

  if (data.details) {
    formData.append('details', buildVideoDetails(data.details));
  }

  const result = await apiFetch('activities/video', { method: 'POST', body: formData });

  if (!result.ok) {
    let detail = `Failed to create activity: ${result.status}`;
    try {
      const errorData = await result.json();
      if (typeof errorData?.detail === 'string') {
        ({ detail } = errorData);
      }
    } catch {
      // Ignore JSON parse failures and preserve the generic message.
    }
    const error: any = new Error(detail);
    error.status = result.status;
    error.detail = detail;
    throw error;
  }

  return (await result.json()) as ActivityRead;
}

/**
 * Create video activity with standard upload
 */
async function createVideoActivityStandard(
  file: File,
  data: any,
  chapterId: number,
  options?: ActivityInvalidationOptions,
  onProgress?: (progress: UploadProgress) => void,
): Promise<ActivityRead> {
  const formData = new FormData();
  formData.append('chapter_id', chapterId.toString());
  formData.append('name', data.name);
  formData.append('video_file', file);

  if (data.details?.subtitles && Array.isArray(data.details.subtitles)) {
    appendSubtitleFiles(formData, data.details.subtitles);
  }

  if (data.details) {
    formData.append('details', buildVideoDetails(data.details));
  }

  return uploadFormData('activities/video', formData, onProgress);
}

/**
 * Create PDF document activity
 */
async function createPdfActivity(
  file: File,
  data: any,
  chapterId: number,
  options?: ActivityInvalidationOptions,
  onProgress?: (progress: UploadProgress) => void,
): Promise<ActivityRead> {
  const formData = new FormData();
  formData.append('chapter_id', chapterId.toString());
  formData.append('pdf_file', file);
  formData.append('name', data.name);

  return uploadFormData('activities/documentpdf', formData, onProgress);
}

/**
 * Create file-based activity (video or PDF)
 */
export async function createFileActivity(
  file: File,
  type: string,
  data: any,
  chapterId: number,
  options?: ActivityInvalidationOptions,
  onProgress?: (progress: UploadProgress) => void,
): Promise<ActivityRead> {
  if (type === 'video') {
    if (shouldUseChunkedUpload(file.size)) {
      console.log('Using chunked upload for video activity');
      return createVideoActivityChunked(file, data, chapterId, options, onProgress);
    }
    return createVideoActivityStandard(file, data, chapterId, options, onProgress);
  }

  if (type === 'documentpdf') {
    return createPdfActivity(file, data, chapterId, options, onProgress);
  }

  throw new Error(`Unsupported file activity type: ${type}`);
}

export async function createExternalVideoActivity(
  data: any,
  activity: any,
  chapter_id: number,
  options?: ActivityInvalidationOptions,
) {
  data.chapter_id = chapter_id;
  data.activity_id = activity.id;

  const defaultDetails = {
    startTime: 0,
    endTime: null,
    autoplay: false,
    muted: false,
  };
  const videoDetails = data.details
    ? {
        startTime: data.details.startTime ?? defaultDetails.startTime,
        endTime: data.details.endTime ?? defaultDetails.endTime,
        autoplay: data.details.autoplay ?? defaultDetails.autoplay,
        muted: data.details.muted ?? defaultDetails.muted,
      }
    : defaultDetails;
  data.details = JSON.stringify(videoDetails);
  const result = await apiFetch('activities/external_video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return getTypedResponseMetadata<ActivityRead>(result);
}

/**
 * Cached fetch for activity by UUID
 */
async function fetchActivity(activity_uuid: string): Promise<ActivityReadWithPermissions> {
  // Support both raw and canonical UUID variants.
  // Some UI routes pass the raw suffix (e.g. "01KE..."), but API uses "activity_...".
  const canonicalActivityUuid = activity_uuid.startsWith('activity_') ? activity_uuid : `activity_${activity_uuid}`;

  const result = await apiFetch(`activities/${canonicalActivityUuid}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    baseUrl: getAPIUrl(),
    signal: AbortSignal.timeout(10_000),
  });
  return (await result.json()) as ActivityReadWithPermissions;
}

export async function getActivity(activity_uuid: string, _next?: any) {
  return fetchActivity(activity_uuid);
}

export async function deleteActivity(activity_uuid: string) {
  const result = await apiFetch(`activities/${activity_uuid}`, { method: 'DELETE' });
  return getTypedResponseMetadata<ActivityDetailResponse>(result);
}

export async function updateActivity(data: any, activity_uuid: string) {
  const result = await apiFetch(`activities/${activity_uuid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return getTypedResponseMetadata<ActivityRead>(result);
}

export async function getUrlPreview(url: string): Promise<UrlPreviewResponse> {
  const result = await apiFetch(`utils/link-preview?url=${url}`);
  return (await result.json()) as UrlPreviewResponse;
}
