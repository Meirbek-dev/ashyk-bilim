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
  run: (action: WorkAction) => Promise<unknown> | undefined
  pending: boolean
  submitting: boolean
}

/**
 * The open attempt's files (B-FSB-04): an uploaded file is attached at once, "Remove" detaches it; at the task's
 * file count the picker is replaced by why. "Submit work" asks first (B-FSB-05).
 */
export function DraftEditor({ task, run, pending, submitting }: DraftEditorProps) {
  const [confirming, setConfirming] = useState(false)
  const files = openAttempt(task)?.files ?? []
  const full = files.length >= task.max_files
  return (
    <div className="flex flex-col gap-4">
      {/* No "no files yet" line above an empty picker: the picker says it. */}
      {files.length > 0 ? (
        <AttemptFiles
          files={files}
          disabled={pending}
          onRemove={id => void run({ kind: 'files', change: { remove: id } })?.catch(() => null)}
        />
      ) : null}
      {/* At the task's file count the picker goes away: a dead drop zone reads as broken. */}
      {full ? (
        <p className="text-sm text-muted-foreground">{m.submission_files_full()}</p>
      ) : (
        <FileInput
          label={m.submission_file_field()}
          purpose="file-submission"
          limits={uploadLimits(task)}
          disabled={pending}
          multiple={task.max_files - files.length}
          onUploaded={(upload, file) =>
            run({ kind: 'files', change: { add: { upload_id: upload.id, display_name: file.name } } })
          }
        />
      )}
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
            void run({ kind: 'submit' })
          }}
        />
      </div>
    </div>
  )
}
