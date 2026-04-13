import { apiFetch, errorHandling } from '@/lib/api-client';

export interface UploadedImageBlockObject {
  block_uuid: string;
  content: {
    file_id: string;
    file_format: string;
  };
}

export async function uploadNewImageFile(file: File, activity_uuid: string): Promise<UploadedImageBlockObject> {
  const formData = new FormData();
  formData.append('file_object', file);
  formData.append('activity_uuid', activity_uuid);

  const response = await apiFetch('blocks/image', { method: 'POST', body: formData });
  return errorHandling(response);
}

export async function getImageFile(file_id: string) {
  const response = await apiFetch(`blocks/image?file_id=${file_id}`);
  return errorHandling(response);
}
