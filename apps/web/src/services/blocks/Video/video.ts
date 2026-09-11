import { uploadBlockFile } from '@services/blocks/upload'
import type { UploadProgress } from '@services/media/uploads'

export const uploadNewVideoFile = (file: File, activityId: string, onProgress?: (progress: UploadProgress) => void) =>
  uploadBlockFile(file, activityId, 'video', onProgress)
