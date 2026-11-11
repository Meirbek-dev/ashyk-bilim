import { Paperclip } from 'lucide-react'
import { useRef } from 'react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'
import { Input } from '#/shared/ui/input'

import { MAX_FILES } from '../model/attachments'

/** «Прикрепить файл»: the system dialog for up to five files at once; the input itself stays hidden. */
export function AttachButton({ count, onFiles }: { count: number; onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const full = count >= MAX_FILES
  return (
    <>
      <Input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={event => {
          const picked = Array.from(event.currentTarget.files ?? [])
          // Cleared so picking the same file again fires onChange again.
          event.currentTarget.value = ''
          if (picked.length > 0) onFiles(picked)
        }}
      />
      <IconButton
        label={full ? m.conversations_files_full() : m.conversations_attach()}
        icon={<Paperclip aria-hidden />}
        disabled={full}
        onClick={() => input.current?.click()}
      />
    </>
  )
}
