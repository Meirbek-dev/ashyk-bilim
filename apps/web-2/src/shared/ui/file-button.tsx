import { useRef } from 'react'

import { Button } from './button'

type FileButtonProps = {
  label: string
  /** The `accept` list of the file dialog, e.g. "image/*". */
  accept: string
  /** One picked file; check it (`checkUpload`) before uploading. */
  onFile: (file: File) => void
  pending?: boolean
}

/** Opens the system file dialog from a kit button; the input itself stays hidden. */
export function FileButton({ label, accept, onFile, pending = false }: FileButtonProps) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
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
      <Button variant="outline" pending={pending} onClick={() => input.current?.click()}>
        {label}
      </Button>
    </>
  )
}
