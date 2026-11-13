import { useMutation } from '@tanstack/react-query'
import { Download } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { AssessmentImport } from '#/shared/api/gen/types.gen'
import { maxUploadBytes } from '#/shared/api/upload'
import { Anchor } from '#/shared/components/anchor'
import { buttonVariants } from '#/shared/components/button-variants'
import { FileInput } from '#/shared/components/file-input'
import { formatFileSize } from '#/shared/i18n/format'

import { TEMPLATE_HREF } from '../model/exports'
import { createImportOptions } from '../queries'
import { FormatCheatSheet } from './format-cheat-sheet'

type FileStepProps = { courseId: string; onCreated: (imported: AssessmentImport) => void }

/**
 * Step 1: pick or drop the .xlsx. It uploads, then the server reads it at once (the answer is the preview); a refusal
 * of either shows under the drop zone with a retry.
 */
export function FileStep({ courseId, onCreated }: FileStepProps) {
  const create = useMutation(createImportOptions())
  return (
    <div className="flex flex-col gap-4">
      <FileInput
        label={m.assessment_import_file_label()}
        description={m.assessment_import_file_hint({ size: formatFileSize(maxUploadBytes('assessment-import')) })}
        purpose="assessment-import"
        onUploaded={async (upload, file) => {
          const imported = await create.mutateAsync({
            path: { course_id: courseId },
            body: { upload_id: upload.id, file_name: file.name },
          })
          onCreated(imported)
        }}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Anchor className={buttonVariants({ variant: 'outline' })} href={TEMPLATE_HREF} download>
          <Download aria-hidden data-icon="inline-start" />
          {m.assessment_import_template()}
        </Anchor>
        <span className="text-sm text-muted-foreground">{m.assessment_import_template_hint()}</span>
      </div>
      <FormatCheatSheet />
    </div>
  )
}
