import { apiFetch } from '@/lib/api-client';
import type { components } from '@/lib/api/generated';
import { shouldUseChunkedUpload, uploadFileChunked } from '@services/utils/chunked-upload';

type ActivityRead = components['schemas']['ActivityRead'];

export interface UploadProgress {
  percentage: number;
  currentChunk?: number;
  totalChunks?: number;
}

interface ActivityInvalidationOptions {
  courseUuid?: string;
}

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

function appendSubtitleFiles(formData: FormData, subtitles: any[]): void {
  for (const subtitle of subtitles) {
    if (subtitle.file) {
      formData.append('subtitle_files', subtitle.file);
    }
  }
}

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

async function createVideoActivityStandard(
  file: File,
  data: any,
  chapterId: number,
  options?: ActivityInvalidationOptions,
  onProgress?: (progress: UploadProgress) => void,
): Promise<ActivityRead> {
  void options;

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

async function createVideoActivityChunked(
  file: File,
  data: any,
  chapterId: number,
  options?: ActivityInvalidationOptions,
  onProgress?: (progress: UploadProgress) => void,
): Promise<ActivityRead> {
  void options;

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

async function createPdfActivityStandard(
  file: File,
  data: any,
  chapterId: number,
  options?: ActivityInvalidationOptions,
  onProgress?: (progress: UploadProgress) => void,
): Promise<ActivityRead> {
  void options;

  const formData = new FormData();
  formData.append('chapter_id', chapterId.toString());
  formData.append('pdf_file', file);
  formData.append('name', data.name);

  return uploadFormData('activities/documentpdf', formData, onProgress);
}

async function createPdfActivityChunked(
  file: File,
  data: any,
  chapterId: number,
  options?: ActivityInvalidationOptions,
  onProgress?: (progress: UploadProgress) => void,
): Promise<ActivityRead> {
  void options;

  const courseUuid = data.course_uuid;

  if (!courseUuid) {
    throw new Error('Missing course_uuid for chunked upload');
  }

  const tempActivityUuid = `activity_temp_${Date.now()}`;
  const pdfFormat = file.name.split('.').pop()?.toLowerCase() || 'pdf';
  const uploadedPath = `courses/${courseUuid}/activities/${tempActivityUuid}/documentpdf/documentpdf.${pdfFormat}`;

  await uploadFileChunked({
    file,
    directory: `courses/${courseUuid}/activities/${tempActivityUuid}/documentpdf`,
    typeOfDir: 'platform',
    filename: `documentpdf.${pdfFormat}`,
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
  formData.append('pdf_uploaded_path', uploadedPath);

  return uploadFormData('activities/documentpdf', formData, onProgress);
}

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
      return createVideoActivityChunked(file, data, chapterId, options, onProgress);
    }

    return createVideoActivityStandard(file, data, chapterId, options, onProgress);
  }

  if (type === 'documentpdf') {
    if (shouldUseChunkedUpload(file.size)) {
      return createPdfActivityChunked(file, data, chapterId, options, onProgress);
    }

    return createPdfActivityStandard(file, data, chapterId, options, onProgress);
  }

  throw new Error(`Unsupported file activity type: ${type}`);
}
