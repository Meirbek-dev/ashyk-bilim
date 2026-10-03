import type { Editor } from '@tiptap/core'
import { Link2 } from 'lucide-react'
import { useState } from 'react'

import { safeUrl } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'
import { Button } from '#/shared/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '#/shared/ui/dialog'

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
    <Dialog open={open} onOpenChange={next => setOpen(next)}>
      <DialogTrigger
        render={<IconButton label={m.editor_link()} icon={<Link2 aria-hidden />} aria-pressed={active} />}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.editor_link()}</DialogTitle>
        </DialogHeader>
        <AttrForm
          fields={[{ name: 'href', label: m.editor_field_url(), check: value => safeUrl(value) !== undefined }]}
          values={{ href }}
          onApply={({ href: next = '' }) =>
            close(() => editor.chain().focus().extendMarkRange('link').setLink({ href: next }).run())
          }
        />
        {active ? (
          <DialogFooter>
            <Button variant="ghost" onClick={() => close(() => editor.chain().focus().unsetLink().run())}>
              {m.editor_link_remove()}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
