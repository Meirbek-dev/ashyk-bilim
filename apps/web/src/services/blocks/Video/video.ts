import { apiFetch } from '@/lib/api-client';
import { shouldUseChunkedUpload, uploadFileChunked } from '@services/utils/chunked-upload';

export async function uploadNewVideoFile(
  file: File,
  activity_uuid: string,
  course_uuid?: string,
  block_uuid?: string,
  onProgress?: (progress: { percentage: number; currentChunk: number; totalChunks: number }) => void,
) {
  // For large files, use chunked upload
  if (shouldUseChunkedUpload(file.size)) {
    console.log('Using chunked upload for large file');

    if (!course_uuid) {
      throw new Error('course_uuid is required for chunked uploads');
    }

    if (!block_uuid) {
      throw new Error('block_uuid is required for chunked uploads');
    }

    try {
      const result = await uploadFileChunked({
        file,
        directory: `courses/${course_uuid}/activities/${activity_uuid}/dynamic/blocks/videoBlock/${block_uuid}`,
        typeOfDir: 'platform',
        filename: `block_${Date.now()}.${file.name.split('.').pop()}`,
        onProgress: onProgress
          ? (progress) =>
              onProgress({
                percentage: progress.percentage,
                currentChunk: progress.currentChunk,
                totalChunks: progress.totalChunks,
              })
          : undefined,
      });

      const savedFilename = result.filename;
      const dotIndex = savedFilename.lastIndexOf('.');
      const fileFormat = dotIndex !== -1 ? savedFilename.slice(dotIndex + 1) : 'bin';
      const fileId = dotIndex !== -1 ? savedFilename.slice(0, dotIndex) : savedFilename;

      return {
        block_uuid,
        content: {
          file_id: fileId,
          file_format: fileFormat,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          activity_uuid,
        },
      };
    } catch (error: any) {
      console.error('Chunked upload error:', error);
      const message = error?.message || JSON.stringify(error);
      throw new Error(message, { cause: error });
    }
  }

  // For smaller files, use traditional upload
  const formData = new FormData();
  formData.append('file_object', file);
  formData.append('activity_uuid', activity_uuid);
  try {
    const result = await apiFetch('blocks/video', { method: 'POST', body: formData });
    return await result.json();
  } catch (error) {
    console.error('error', error);
    throw error;
  }
}

export async function getVideoFile(file_id: string) {
  try {
    const result = await apiFetch(`blocks/video?file_id=${file_id}`);
    return await result.json();
  } catch (error) {
    console.error('error', error);
    throw error;
  }
}
