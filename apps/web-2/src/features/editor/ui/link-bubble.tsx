import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { ExternalLink, Pencil, Unlink } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Anchor } from '#/shared/components/anchor'

import { ToolButton } from './toolbar/tool-button'

/**
 * Under a link the caret is in: its address (opens in a new tab), edit (the link dialog) and remove, so a link is
 * checked and fixed where it is, without selecting it first.
 */
export function LinkBubble({ editor, onEdit }: { editor: Editor; onEdit: () => void }) {
  const href = useEditorState({
    editor,
    selector: ({ editor: current }) => String(current.getAttributes('link')['href'] ?? ''),
  })
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="linkBubble"
      shouldShow={({ editor: current }) => current.isEditable && current.isActive('link')}
      options={{ placement: 'bottom-start', offset: 6 }}
      className="z-30 flex max-w-sm items-center gap-0.5 rounded-lg bg-popover py-0.5 pr-0.5 pl-2 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      <Anchor
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 items-center gap-1.5 underline underline-offset-4"
      >
        <ExternalLink aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{href}</span>
      </Anchor>
      <ToolButton label={m.editor_link_edit()} icon={<Pencil aria-hidden />} keys="Mod-k" onClick={onEdit} />
      <ToolButton
        label={m.editor_link_remove()}
        icon={<Unlink aria-hidden />}
        onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
      />
    </BubbleMenu>
  )
}
