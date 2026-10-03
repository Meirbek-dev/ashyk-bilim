import type { UploadPurpose } from '#/shared/api/upload'

import { FileInput } from '../file-input'
import { errorText } from './field-errors'
import { useFieldContext } from './form-context'

type FileFieldProps = { label: string; description?: string; purpose: UploadPurpose }

/** The field's value is the finalized upload id: `<f.FileField purpose="course-thumbnail" ... />` on `xx_upload_id`. */
export function FileField({ label, description, purpose }: FileFieldProps) {
  const field = useFieldContext<string | null | undefined>()
  return (
    <FileInput
      label={label}
      description={description}
      purpose={purpose}
      error={errorText(field.state.meta.errors)}
      onUploaded={upload => field.handleChange(upload.id)}
    />
  )
}
