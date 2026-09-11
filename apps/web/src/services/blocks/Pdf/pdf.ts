import { uploadBlockFile } from '@services/blocks/upload'

export const uploadNewPDFFile = (file: File, activityId: string) => uploadBlockFile(file, activityId, 'pdf')
