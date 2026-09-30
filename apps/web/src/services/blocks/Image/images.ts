import { uploadBlockFile } from '@services/blocks/upload'
import type { BlockFileObject } from '@services/blocks/upload'

export type UploadedImageBlockObject = BlockFileObject

export const uploadNewImageFile = (file: File, activityId: string) => uploadBlockFile(file, activityId, 'image')
