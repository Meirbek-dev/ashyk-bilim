import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { FileSubmission } from '#/shared/api/gen/types.gen'
import { FileInput } from '#/shared/components/file-input'
import { Spinner } from '#/shared/ui/spinner'

import { attemptNumber, openAttempt, uploadLimits, type WorkAction } from '../model/task'
import { AttemptFiles } from './attempt-files'
import { SubmitDialog } from './submit-dialog'

type DraftEditorProps = {
  task: FileSubmission
  run: (action: WorkAction) => void
  pending: boolean
  submitting: boolean
}

/**
 * The open attempt's files (B-FSB-04): an uploaded file is attached at once, "Remove" detaches it; at the task's
 * file count the picker is off and says why. "Submit work" asks first (B-FSB-05).
 */
export function DraftEditor({ task, run, pending, submitting }: DraftEditorProps) {
  const [confirming, setConfirming] = useState(false)
  const files = openAttempt(task)?.files ?? []
  const full = files.length >= task.max_files
  return (
    <div className="flex flex-col gap-4">
      <AttemptFiles files={files} disabled={pending} onRemove={id => run({ kind: 'files', change: { remove: id } })} />
      <FileInput
        label={m.submission_file_field()}
        description={full ? m.submission_files_full() : undefined}
        purpose="file-submission"
        limits={uploadLimits(task)}
        disabled={full || pending}
        onUploaded={(upload, file) =>
          run({ kind: 'files', change: { add: { upload_id: upload.id, display_name: file.name } } })
        }
      />
      <div>
        <SubmitDialog
          open={confirming}
          onOpenChange={setConfirming}
          number={attemptNumber(task)}
          max={task.max_attempts}
          disabled={files.length === 0 || pending}
          trigger={
            <>
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              {m.submission_submit()}
            </>
          }
          onConfirm={() => {
            setConfirming(false)
            run({ kind: 'submit' })
          }}
        />
      </div>
    </div>
  )
}
