import type { Editor } from '@tiptap/core'
import { Link2 } from 'lucide-react'
import { useState } from 'react'

import { safeUrl } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'
import { Dialog } from '#/shared/ui/dialog'
import { IconButton } from '#/shared/ui/icon-button'

import { AttrForm } from '../nodes/attr-form'

/** Link on the selected text: a dialog with the address; an existing link can be removed. */
export function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false)
  const href = String(editor.getAttributes('link')['href'] ?? '')
  const close = (run: () => boolean) => {
    run()
    setOpen(false)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={<IconButton label={m.editor_link()} icon={<Link2 aria-hidden />} aria-pressed={active} />}
      title={m.editor_link()}
      footer={
        active ? (
          <Button variant="ghost" onClick={() => close(() => editor.chain().focus().unsetLink().run())}>
            {m.editor_link_remove()}
          </Button>
        ) : null
      }
    >
      <AttrForm
        fields={[{ name: 'href', label: m.editor_field_url(), check: value => safeUrl(value) !== undefined }]}
        values={{ href }}
        onApply={({ href: next = '' }) =>
          close(() => editor.chain().focus().extendMarkRange('link').setLink({ href: next }).run())
        }
      />
    </Dialog>
  )
}
