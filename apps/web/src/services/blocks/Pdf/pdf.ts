import { apiJson } from '@/lib/api-client'
import type { PdfBlockObject } from '@/components/Objects/Editor/Extensions/PDF/PDFBlock'

export async function uploadNewPDFFile(file: File, activity_uuid: string): Promise<PdfBlockObject> {
  const formData = new FormData()
  formData.append('file_object', file)
  formData.append('activity_uuid', activity_uuid)
  return apiJson<PdfBlockObject>('blocks/pdf', { method: 'POST', body: formData })
}
