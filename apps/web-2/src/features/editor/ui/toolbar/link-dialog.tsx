import type { Editor } from '@tiptap/core'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '#/shared/ui/dialog'

import { linkHref } from '../../model/link'
import { AttrForm } from '../nodes/attr-form'

type LinkDialogProps = { editor: Editor; open: boolean; onOpenChange: (open: boolean) => void }

/**
 * The link on the selected text: its address, applied over the whole link under the caret; an existing link can be
 * removed. Opened by the toolbar, Ctrl/⌘+K and the link's bubble.
 */
export function LinkDialog({ editor, open, onOpenChange }: LinkDialogProps) {
  const href = String(editor.getAttributes('link')['href'] ?? '')
  const close = (run: () => boolean) => {
    run()
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={next => onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.editor_link()}</DialogTitle>
        </DialogHeader>
        <AttrForm
          fields={[{ name: 'href', label: m.editor_field_url(), check: value => linkHref(value) !== undefined }]}
          values={{ href }}
          onApply={({ href: next = '' }) =>
            close(() =>
              editor
                .chain()
                .focus()
                .extendMarkRange('link')
                .setLink({ href: linkHref(next) ?? next })
                .run(),
            )
          }
        />
        {href ? (
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
