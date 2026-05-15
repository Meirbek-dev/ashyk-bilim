import { apiFetch } from '@/lib/api-client';

export async function uploadNewPDFFile(file: File, activity_uuid: string) {
  const formData = new FormData();
  formData.append('file_object', file);
  formData.append('activity_uuid', activity_uuid);
  return apiFetch('blocks/pdf', { method: 'POST', body: formData })
    .then((result) => result.json())
    .catch((error: unknown) => {
      console.log('error', error);
    });
}

