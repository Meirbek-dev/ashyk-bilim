import { apiJson } from '@/lib/api-client'
import { clientApiError } from '@/lib/api/assertSuccess'
import type { VideoBlockObject } from '@/components/Objects/Editor/Extensions/Video/VideoBlock'
import { shouldUseChunkedUpload, uploadFileChunked } from '@services/utils/chunked-upload'

export async function uploadNewVideoFile(
  file: File,
  activity_uuid: string,
  course_uuid?: string,
  block_uuid?: string,
  onProgress?: (progress: { percentage: number; currentChunk: number; totalChunks: number }) => void,
): Promise<VideoBlockObject> {
  // For large files, use chunked upload
  if (shouldUseChunkedUpload(file.size)) {
    console.log('Using chunked upload for large file')

    if (!course_uuid) {
      throw clientApiError('INVALID_CLIENT_REQUEST', 'course_uuid is required for chunked uploads', {
        path: 'uploads/initiate',
      })
    }

    if (!block_uuid) {
      throw clientApiError('INVALID_CLIENT_REQUEST', 'block_uuid is required for chunked uploads', {
        path: 'uploads/initiate',
      })
    }

    const uploadProgress = onProgress
      ? (progress: { percentage: number; currentChunk: number; totalChunks: number }) =>
          onProgress({
            percentage: progress.percentage,
            currentChunk: progress.currentChunk,
            totalChunks: progress.totalChunks,
          })
      : undefined

    const result = await uploadFileChunked({
      file,
      directory: `courses/${course_uuid}/activities/${activity_uuid}/dynamic/blocks/videoBlock/${block_uuid}`,
      typeOfDir: 'platform',
      filename: `block_${Date.now()}.${file.name.split('.').pop()}`,
      ...(uploadProgress ? { onProgress: uploadProgress } : {}),
    })

    const savedFilename = result.filename
    const dotIndex = savedFilename.lastIndexOf('.')
    const fileFormat = dotIndex !== -1 ? savedFilename.slice(dotIndex + 1) : 'bin'
    const fileId = dotIndex !== -1 ? savedFilename.slice(0, dotIndex) : savedFilename

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
    } as VideoBlockObject
  }

  // For smaller files, use traditional upload
  const formData = new FormData()
  formData.append('file_object', file)
  formData.append('activity_uuid', activity_uuid)
  return apiJson<VideoBlockObject>('blocks/video', {
    method: 'POST',
    body: formData,
  })
}
