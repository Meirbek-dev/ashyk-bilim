import { useRef } from 'react'

import { SubmitButton } from '#/shared/components/submit-button'
import { Input } from '#/shared/ui/input'

type FileButtonProps = {
  label: string
  /** The `accept` list of the file dialog, e.g. "image/*". */
  accept: string
  /** One picked file; check it (`checkUpload`) before uploading. */
  onFile: (file: File) => void
  pending?: boolean
}

/** Opens the system file dialog from a stock button; the file input itself stays hidden. */
export function FileButton({ label, accept, onFile, pending = false }: FileButtonProps) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={event => {
          const file = event.currentTarget.files?.[0]
          // Cleared so picking the same file again fires onChange again.
          event.currentTarget.value = ''
          if (file) onFile(file)
        }}
      />
      <SubmitButton variant="outline" pending={pending} onClick={() => input.current?.click()}>
        {label}
      </SubmitButton>
    </>
  )
}
